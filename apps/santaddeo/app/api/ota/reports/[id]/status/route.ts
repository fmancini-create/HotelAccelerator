import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"

/**
 * Lightweight endpoint for the client to poll the processing status of an
 * OTA PDF upload. Returns `processing | done | error` so the UI can show a
 * spinner on the specific row in the history table.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: report, error } = await supabase
    .from("hotel_ota_reports")
    .select(
      "id, hotel_id, processing_status, processing_error, period_start, period_end, processed_at",
    )
    .eq("id", id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!report) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }

  // Reuse the same access check used by the upload route so a user cannot
  // spy on other tenants' report statuses by iterating ids.
  const denied = await validateHotelAccess(report.hotel_id)
  if (denied) return denied

  return NextResponse.json({
    id: report.id,
    status: report.processing_status as "processing" | "done" | "error",
    error: report.processing_error ?? null,
    periodStart: report.period_start ?? null,
    periodEnd: report.period_end ?? null,
    processedAt: report.processed_at ?? null,
  })
}
