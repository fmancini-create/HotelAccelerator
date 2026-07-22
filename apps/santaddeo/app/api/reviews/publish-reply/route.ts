import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/direct"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import {
  getAccessToken,
  listAccounts,
  listLocations,
  listReviews,
  updateReply,
  GoogleBusinessAuthError,
  GoogleBusinessQuotaError,
} from "@/lib/google/business-profile"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Pubblica la risposta a una recensione direttamente sul canale.
 *
 * Oggi supporta SOLO Google (API ufficiale Business Profile). Per Booking serve
 * essere Connectivity Partner accreditato; TripAdvisor non ha API → in entrambi
 * i casi rispondiamo con 409 e l'utente usa "Copia" nell'extranet.
 *
 * Nessun finto successo: se l'account non è collegato o la quota API non è
 * approvata, ritorniamo errori chiari e azionabili.
 *
 * POST { reviewId: string (uuid interno), text: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { reviewId, text } = (await request.json()) as {
      reviewId?: string
      text?: string
    }
    if (!reviewId || !text?.trim()) {
      return NextResponse.json({ error: "reviewId e text richiesti" }, { status: 400 })
    }

    const supabase = await createServiceRoleClient()
    const { data: review, error: revErr } = await supabase
      .from("hotel_reviews")
      .select("id, hotel_id, platform, review_id, external_response_name, author_name")
      .eq("id", reviewId)
      .maybeSingle()
    if (revErr) return NextResponse.json({ error: revErr.message }, { status: 500 })
    if (!review) return NextResponse.json({ error: "Recensione non trovata" }, { status: 404 })

    const denied = await validateHotelAccess(review.hotel_id)
    if (denied) return denied

    const platform = (review.platform || "").toLowerCase()

    // --- Canali senza pubblicazione diretta ---
    if (platform !== "google") {
      const reason =
        platform === "booking" || platform === "booking.com"
          ? "La pubblicazione su Booking richiede l'accreditamento come Connectivity Partner: per ora copia la risposta nell'extranet."
          : "Questo canale non espone un'API per pubblicare le risposte: copia la risposta nell'extranet."
      return NextResponse.json({ error: reason, code: "channel_unsupported" }, { status: 409 })
    }

    // --- Google: serve il collegamento OAuth ---
    const { data: integ } = await supabase
      .from("hotel_integrations")
      .select(
        "google_business_oauth_refresh_token, google_business_account_id, google_business_location_id",
      )
      .eq("hotel_id", review.hotel_id)
      .maybeSingle()

    const refreshToken = integ?.google_business_oauth_refresh_token
    if (!refreshToken) {
      return NextResponse.json(
        {
          error: "Collega l'account Google Business in Impostazioni → Avanzate per pubblicare.",
          code: "not_connected",
        },
        { status: 409 },
      )
    }

    try {
      const accessToken = await getAccessToken(refreshToken)

      // Risolvi account/location: usa quelli salvati, altrimenti scoprili.
      let accountId = integ?.google_business_account_id || null
      let locationId = integ?.google_business_location_id || null
      if (!accountId || !locationId) {
        const accounts = await listAccounts(accessToken)
        if (accounts.length === 0) {
          return NextResponse.json(
            { error: "Nessun account Google Business trovato per l'utente collegato.", code: "no_account" },
            { status: 409 },
          )
        }
        accountId = accounts[0].name
        const locations = await listLocations(accessToken, accountId)
        if (locations.length === 0) {
          return NextResponse.json(
            { error: "Nessuna sede Google Business trovata.", code: "no_location" },
            { status: 409 },
          )
        }
        locationId = locations[0].name
        // Persisti per le prossime volte.
        await supabase
          .from("hotel_integrations")
          .update({
            google_business_account_id: accountId,
            google_business_location_id: locationId,
            updated_at: new Date().toISOString(),
          })
          .eq("hotel_id", review.hotel_id)
      }

      // Risolvi il resource name della recensione.
      let reviewName = review.external_response_name as string | null
      if (!reviewName) {
        // L'id Apify per Google coincide col reviewId dell'API v4: prova a
        // costruirlo direttamente, poi verifica via listReviews come fallback.
        const acct = accountId.startsWith("accounts/") ? accountId : `accounts/${accountId}`
        const loc = locationId.startsWith("locations/") ? locationId : `locations/${locationId}`
        const candidate = `${acct}/${loc}/reviews/${review.review_id}`

        // Verifica esistenza abbinando per reviewId (robusto a id offuscati).
        const reviews = await listReviews(accessToken, accountId, locationId)
        const match =
          reviews.find((r) => r.name === candidate) ||
          reviews.find((r) => r.reviewId === review.review_id) ||
          reviews.find(
            (r) =>
              (r.reviewer?.displayName || "").trim() === (review.author_name || "").trim() &&
              !!review.author_name,
          )
        reviewName = match?.name || null
        if (!reviewName) {
          return NextResponse.json(
            {
              error:
                "Impossibile abbinare questa recensione all'account Google collegato. Verifica che la sede collegata sia quella corretta.",
              code: "review_not_matched",
            },
            { status: 409 },
          )
        }
      }

      const { updateTime } = await updateReply(accessToken, reviewName, text.trim())
      const nowIso = new Date().toISOString()

      await supabase
        .from("hotel_reviews")
        .update({
          response_text: text.trim(),
          response_date: updateTime || nowIso,
          response_published_at: nowIso,
          external_response_name: reviewName,
          draft_response_status: "published",
          updated_at: nowIso,
        })
        .eq("id", review.id)

      return NextResponse.json({ ok: true, publishedAt: nowIso })
    } catch (e) {
      if (e instanceof GoogleBusinessQuotaError) {
        return NextResponse.json(
          {
            error:
              "L'accesso all'API Google Business non è ancora approvato per questo progetto. La risposta è salvata come bozza: pubblicala dall'extranet finché l'API non viene abilitata.",
            code: "quota_not_approved",
          },
          { status: 403 },
        )
      }
      if (e instanceof GoogleBusinessAuthError) {
        return NextResponse.json(
          {
            error: "Collegamento Google scaduto o revocato: ricollega l'account in Impostazioni → Avanzate.",
            code: "auth_expired",
          },
          { status: 401 },
        )
      }
      throw e
    }
  } catch (err) {
    console.error("[reviews/publish-reply] error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 },
    )
  }
}
