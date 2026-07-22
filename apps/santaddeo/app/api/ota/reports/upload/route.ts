import { NextResponse, after } from "next/server"
import { put } from "@vercel/blob"
import { createClient } from "@/lib/supabase/server"
import { extractOtaReport } from "@/lib/services/ota-report-extractor"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { bridgeOtaSnapshotToPricingAlgoParams } from "@/lib/services/ota-pricing-bridge"
import type { OtaKpiSnapshotInput } from "@/lib/services/ota-signal-scorer"

// Max runtime the function can spend in TOTAL, including work scheduled via
// `after()` after the response has been sent. We need headroom for the LLM
// extraction step even though the client no longer waits for it.
export const maxDuration = 300

// Allowed MIME types - PDF for Booking, PDF + XLSX for Expedia.
// We deliberately accept both globally because users may also export Booking
// reports as XLSX in newer Extranet versions, and Expedia Partner Central
// often exports as PDF for executive summaries.
const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls (legacy)
  // Dashboard screenshots (Expedia "Dati e informazioni" has no export button).
  "image/png",
  "image/jpeg",
  "image/webp",
]
const ACCEPTED_EXTENSIONS = /\.(pdf|xlsx|xls|png|jpe?g|webp)$/i

/**
 * Receives an OTA performance/production report and extracts KPIs via AI.
 *
 * Supports:
 * - Booking.com Extranet PDFs ("Report sull'andamento", "Performance Report")
 * - Expedia Partner Central exports (PDF + XLSX)
 *
 * Pipeline (response stays under 1s):
 *   1. Validate inputs, auth, and file type/size
 *   2. Persist file to Vercel Blob (private)
 *   3. Insert `hotel_ota_reports` with status=processing
 *   4. RETURN reportId to the client so the UI can start polling
 *   5. In `after()`: AI extraction → upsert KPI snapshot → flip report to done/error
 *
 * FASE 2 refactor 12/05/2026: accept `platform` form field ('booking_com'|'expedia'),
 * route to platform-aware extractor (`lib/services/ota-report-extractor.ts`),
 * preserve all existing schema mapping logic.
 */
export async function POST(request: Request) {
  const form = await request.formData()
  const file = form.get("file") as File | null
  const hotelId = String(form.get("hotelId") || "")
  // Platform parameter: defaults to "booking_com" to preserve backward compat
  // with the existing BookingKpiTab UI that doesn't send this field yet.
  const platformRaw = String(form.get("platform") || "booking_com")
  const platform: "booking_com" | "expedia" =
    platformRaw === "expedia" ? "expedia" : "booking_com"

  if (!file || !hotelId) {
    return NextResponse.json({ error: "file and hotelId required" }, { status: 400 })
  }
  
  // File type validation: accept PDF + XLSX
  const isAcceptedMime = ACCEPTED_MIME_TYPES.includes(file.type)
  const isAcceptedExt = ACCEPTED_EXTENSIONS.test(file.name)
  if (!isAcceptedMime && !isAcceptedExt) {
    return NextResponse.json(
      { error: "Solo file PDF, Excel (.xlsx) o immagini (PNG/JPG) sono accettati" },
      { status: 400 },
    )
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Il file deve essere < 10 MB" }, { status: 400 })
  }

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // --- 1) Blob upload (small files: 1-3 MB typical) ---
  let blobUrl: string
  try {
    // The project Blob store is PRIVATE - we never expose the file URL in UI;
    // the LLM extractor reads it server-side. Future signed-URL download via
    // @vercel/blob if we ever need to show the original PDF to the user.
    const blob = await put(
      `ota-reports/${hotelId}/${platform}/${Date.now()}-${file.name}`,
      file,
      {
        access: "private",
        contentType: file.type || "application/octet-stream",
        addRandomSuffix: true,
      },
    )
    blobUrl = blob.url
  } catch (err: any) {
    console.error("[ota-upload] Blob upload failed:", err)
    return NextResponse.json(
      { error: `Blob upload failed: ${err?.message || "unknown"}` },
      { status: 500 },
    )
  }

  // --- 2) Insert report row with status=processing ---
  const { data: report, error: recordError } = await supabase
    .from("hotel_ota_reports")
    .insert({
      hotel_id: hotelId,
      platform,
      file_path: blobUrl,
      file_name: file.name,
      file_size: file.size,
      processing_status: "processing",
      uploaded_by: user?.id ?? null,
    })
    .select()
    .single()

  if (recordError || !report) {
    console.error("[ota-upload] DB insert failed:", recordError)
    return NextResponse.json(
      { error: recordError?.message || "Insert failed" },
      { status: 500 },
    )
  }

  // Capture file bytes BEFORE the response returns - the request body is
  // consumed once and cannot be re-read inside `after()`.
  const bytes = Buffer.from(await file.arrayBuffer())
  const userId = user?.id ?? null
  const reportId = report.id
  const fileName = file.name
  const mimeType = file.type

  // --- 3) Schedule the heavy work post-response ---
  after(async () => {
    try {
      console.log(`[ota-upload] extraction starting`, {
        reportId,
        platform,
        fileName,
        mimeType,
        size: bytes.length,
      })
      
      const result = await extractOtaReport({
        platform,
        fileBuffer: bytes,
        fileName,
        mimeType,
      })

      if (!result.success || !result.data) {
        throw new Error(result.error || "Estrazione fallita")
      }

      const extracted = result.data
      const warnings = result.warnings ?? []
      console.log(
        `[ota-upload] extraction done`,
        {
          reportId,
          platform,
          period: `${extracted.period_start}→${extracted.period_end}`,
          reportType: result.report_type,
          warnings,
        },
      )

      // Period must be present (extractor already derives from monthly_breakdown if missing)
      const periodStart = extracted.period_start
      const periodEnd = extracted.period_end

      if (periodStart && periodEnd) {
        // Selective upsert: only set the fields actually present in this report.
        // Two consecutive uploads (e.g. Performance then Production) of the same
        // platform+period MERGE into a single snapshot — existing values are NOT
        // overwritten with null. Required for "mixed" reports built across two
        // uploads to coexist on one row.
        const hasTraffic =
          extracted.search_views != null ||
          extracted.property_views != null ||
          extracted.bookings_count != null
        const hasProduction =
          extracted.total_revenue != null ||
          extracted.total_room_nights != null ||
          extracted.adr != null ||
          (Array.isArray(extracted.monthly_breakdown) && extracted.monthly_breakdown.length > 0)

        const reportType =
          result.report_type ??
          (hasTraffic && hasProduction
            ? "mixed"
            : hasProduction
              ? "production"
              : hasTraffic
                ? "performance"
                : null)

        const snapshotPayload: Record<string, unknown> = {
          hotel_id: hotelId,
          platform,
          period_start: periodStart,
          period_end: periodEnd,
          notes:
            `Imported from ${platform === "expedia" ? "Expedia" : "Booking.com"} report` +
            (warnings.length > 0 ? ` — ATTENZIONE: ${warnings.join(" ")}` : ""),
          created_by: userId,
          updated_at: new Date().toISOString(),
        }
        if (hasTraffic) {
          snapshotPayload.search_views = extracted.search_views ?? null
          snapshotPayload.property_views = extracted.property_views ?? null
          snapshotPayload.bookings_count = extracted.bookings_count ?? null
          snapshotPayload.prev_search_views = extracted.prev_search_views ?? null
          snapshotPayload.prev_property_views = extracted.prev_property_views ?? null
          snapshotPayload.prev_bookings_count = extracted.prev_bookings_count ?? null
        }
        if (extracted.ranking_score != null) snapshotPayload.ranking_score = extracted.ranking_score
        if (extracted.ranking_position != null) snapshotPayload.ranking_position = extracted.ranking_position
        if (extracted.total_competitors != null) snapshotPayload.total_competitors = extracted.total_competitors
        if (hasProduction) {
          snapshotPayload.total_room_nights = extracted.total_room_nights ?? null
          snapshotPayload.total_revenue = extracted.total_revenue ?? null
          snapshotPayload.adr = extracted.adr ?? null
          snapshotPayload.prev_total_room_nights = extracted.prev_total_room_nights ?? null
          snapshotPayload.prev_total_revenue = extracted.prev_total_revenue ?? null
          snapshotPayload.prev_adr = extracted.prev_adr ?? null
          snapshotPayload.monthly_breakdown = extracted.monthly_breakdown ?? null
        }
        if (reportType) snapshotPayload.report_type = reportType

        // Guard: if the extractor produced neither traffic nor production data,
        // there is nothing to save — don't create an empty snapshot and don't
        // report a false success.
        if (!hasTraffic && !hasProduction) {
          throw new Error(
            "L'AI non ha riconosciuto KPI utilizzabili in questo file (ne' traffico ne' produzione). " +
              "Se e' uno screenshot, assicurati che le card con i numeri siano ben visibili, oppure inserisci i dati manualmente qui sotto.",
          )
        }

        const { error: snapErr } = await supabase
          .from("hotel_ota_kpi_snapshots")
          .upsert(snapshotPayload, {
            onConflict: "hotel_id,platform,period_start,period_end",
          })
        if (snapErr) {
          console.error("[ota-upload] snapshot upsert error:", snapErr)
          throw new Error(`Salvataggio KPI non riuscito: ${snapErr.message}`)
        }

        // FASE 5 BRIDGE: feed the K-driven engine via pricing_algo_params.
        // SAFE: writes only to pricing_algo_params, never touches pricing_grid
        // or the engine itself. Errors here are NON-FATAL — they shouldn't
        // mark the upload as failed; the snapshot was saved successfully.
        try {
          const bridgeInput: OtaKpiSnapshotInput & { hotel_id: string } = {
            hotel_id: hotelId,
            platform,
            period_start: periodStart,
            period_end: periodEnd,
            search_views: extracted.search_views ?? null,
            property_views: extracted.property_views ?? null,
            bookings_count: extracted.bookings_count ?? null,
            prev_search_views: extracted.prev_search_views ?? null,
            prev_property_views: extracted.prev_property_views ?? null,
            prev_bookings_count: extracted.prev_bookings_count ?? null,
            ranking_score: extracted.ranking_score ?? null,
            ranking_position: extracted.ranking_position ?? null,
            total_competitors: extracted.total_competitors ?? null,
            total_room_nights: extracted.total_room_nights ?? null,
            total_revenue: extracted.total_revenue ?? null,
            adr: extracted.adr ?? null,
          }
          const bridgeResult = await bridgeOtaSnapshotToPricingAlgoParams(
            supabase,
            bridgeInput,
          )
          console.log("[ota-upload] bridge done", {
            reportId,
            rows: bridgeResult.rows_written,
            scores: bridgeResult.scores,
            errors: bridgeResult.errors,
          })

          // Persist scores back onto the snapshot for transparency
          // (the UI can show "AUTO: views=7.3, conversion=5.1, ...").
          await supabase
            .from("hotel_ota_kpi_snapshots")
            .update({ normalized_scores: bridgeResult.scores })
            .eq("hotel_id", hotelId)
            .eq("platform", platform)
            .eq("period_start", periodStart)
            .eq("period_end", periodEnd)
        } catch (bridgeErr: any) {
          console.error("[ota-upload] bridge failed (non-fatal):", bridgeErr)
        }
      } else {
        // No usable period → we cannot key a snapshot. This is the classic
        // "screenshot with a relative range (ultimi 90 giorni)" case: the dates
        // are not machine-readable. Fail LOUDLY with an actionable message
        // instead of silently marking the report "done" with nothing saved.
        console.warn("[ota-upload] no period extracted, skipping snapshot upsert", { reportId })
        throw new Error(
          "Non riesco a leggere il periodo di riferimento dal file. " +
            "Se e' uno screenshot, imposta prima su Expedia un intervallo di date preciso (evita 'ultimi 90 giorni'), " +
            "oppure usa l'inserimento manuale indicando le date del periodo.",
        )
      }

      await supabase
        .from("hotel_ota_reports")
        .update({
          extracted_data: extracted,
          period_start: periodStart ?? null,
          period_end: periodEnd ?? null,
          processing_status: "done",
          processed_at: new Date().toISOString(),
        })
        .eq("id", reportId)

      // Reset the reminder timer for this user+hotel+platform combination.
      if (userId) {
        await supabase
          .from("ota_reminder_settings")
          .update({
            last_triggered_at: new Date().toISOString(),
            next_run_at: new Date(
              Date.now() + 30 * 24 * 60 * 60 * 1000,
            ).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("hotel_id", hotelId)
          .eq("user_id", userId)
          .eq("platform", platform)
      }
    } catch (err: any) {
      console.error("[ota-upload] extraction failed:", err)
      await supabase
        .from("hotel_ota_reports")
        .update({
          processing_status: "error",
          processing_error: err?.message || "Unknown error",
          processed_at: new Date().toISOString(),
        })
        .eq("id", reportId)
    }
  })

  // --- 4) Immediate response: spinner closes right away ---
  return NextResponse.json({
    success: true,
    reportId,
    status: "processing",
  })
}
