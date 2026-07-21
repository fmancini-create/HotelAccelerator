/**
 * One-off: force a FULL Booking.com resync (up to 2000 reviews) for a single
 * hotel, bypassing both the Vercel 5-minute function timeout and the service's
 * automatic incremental-mode detection.
 *
 * Usage (env must be loaded from /vercel/share/.env.project):
 *   node --env-file-if-exists=/vercel/share/.env.project \
 *     scripts/resync-booking-full.mjs <hotelId>
 *
 * Required env:
 *   APIFY_API_TOKEN
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://aeynirkfixurikshxfov.supabase.co"
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const hotelId = process.argv[2]
if (!hotelId) {
  console.error("Usage: node scripts/resync-booking-full.mjs <hotelId>")
  process.exit(1)
}
if (!APIFY_API_TOKEN || !SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing env: APIFY_API_TOKEN / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const BOOKING_ACTOR = "voyager~booking-reviews-scraper"
const MAX_REVIEWS = 2000

// ---------------------- Supabase REST helpers (no SDK) ----------------------
const sb = {
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  },
  async get(path) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: this.headers })
    if (!res.ok) throw new Error(`SB GET ${path}: ${res.status} ${await res.text()}`)
    return res.json()
  },
  async upsert(table, rows, onConflict) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
      {
        method: "POST",
        headers: {
          ...this.headers,
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(rows),
      }
    )
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`SB UPSERT ${table}: ${res.status} ${body.slice(0, 500)}`)
    }
  },
  async patch(table, filter, patch) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: "PATCH",
      headers: { ...this.headers, Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    })
    if (!res.ok) throw new Error(`SB PATCH ${table}: ${res.status} ${await res.text()}`)
  },
}

// --------------------------- Rating normalization ---------------------------
/** Normalize any rating/scale to a 1-5 canonical value with original kept aside. */
function normalizeRating(rating, scale) {
  const originalRating = rating == null ? null : Number(rating)
  const originalScale = scale || 10
  if (originalRating == null || Number.isNaN(originalRating)) {
    return { value: null, originalRating: null, originalScale }
  }
  if (originalScale === 5) return { value: originalRating, originalRating, originalScale }
  // 1-10 → 1-5
  return { value: originalRating / 2, originalRating, originalScale }
}

// ------------------------------ Booking parser ------------------------------
/** Must match lib/services/apify-review-service.ts parseReview for booking. */
function parseBookingReview(r) {
  const liked = r.likedText || r.positive
  const disliked = r.dislikedText || r.negative
  const parts = [
    liked ? `Positivo: ${liked}` : null,
    disliked ? `Negativo: ${disliked}` : null,
  ].filter(Boolean)
  return {
    reviewId:
      r.id ||
      r.reviewId ||
      `booking_${r.reviewDate || r.date}_${(r.userName || r.reviewer?.name || "").slice(0, 10)}`,
    authorName: r.userName || r.reviewer?.name || r.reviewerName,
    text: parts.length ? parts.join(" | ") : r.reviewText || r.text || null,
    title: r.reviewTitle || r.title,
    rating: r.rating ?? r.score,
    ratingScale: 10,
    reviewDate: r.reviewDate || r.date,
    stayDate: r.checkInDate || r.stayDate,
    responseText: r.propertyResponse || r.response?.text || r.hotelResponse,
    responseDate: r.propertyResponseDate || r.response?.date,
    language: r.reviewLanguage || r.language,
  }
}

// --------------------------- Main ---------------------------
async function main() {
  console.log(`[resync] hotelId=${hotelId} target=${MAX_REVIEWS} reviews`)

  // 1) Load integration
  const integRows = await sb.get(
    `hotel_integrations?hotel_id=eq.${hotelId}&select=booking_com_url`
  )
  if (!integRows?.[0]?.booking_com_url) {
    console.error("No booking_com_url configured for this hotel.")
    process.exit(1)
  }
  const bookingUrl = integRows[0].booking_com_url
  console.log(`[resync] Booking URL: ${bookingUrl}`)

  // 2) Start Apify run
  const input = {
    startUrls: [{ url: bookingUrl }],
    maxReviewsPerHotel: MAX_REVIEWS,
    sortReviewsBy: "f_recent_desc",
  }
  console.log(`[resync] Starting Apify actor ${BOOKING_ACTOR}...`)
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/${BOOKING_ACTOR}/runs?token=${APIFY_API_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  const start = await startRes.json()
  if (!startRes.ok || !start?.data?.id) {
    console.error("Failed to start run:", JSON.stringify(start).slice(0, 500))
    process.exit(1)
  }
  const runId = start.data.id
  const datasetId = start.data.defaultDatasetId
  console.log(`[resync] runId=${runId}  datasetId=${datasetId}`)

  // 3) Poll until done (no time limit; CLI context)
  let status = start.data.status
  let polls = 0
  while (!/SUCCEEDED|FAILED|ABORTED|TIMED-OUT/.test(status)) {
    await new Promise((r) => setTimeout(r, 10_000))
    polls++
    const r = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_TOKEN}`)
    const d = (await r.json()).data
    status = d?.status
    const cnt = d?.stats?.outputItemCount ?? "?"
    console.log(`[resync] poll ${polls} (${polls * 10}s): ${status}  items=${cnt}`)
  }
  if (status !== "SUCCEEDED") {
    console.error(`Apify run ended with status ${status}, aborting.`)
    process.exit(1)
  }

  // 4) Fetch dataset
  const rawItems = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_TOKEN}&clean=true`
  ).then((r) => r.json())
  console.log(`[resync] Downloaded ${rawItems.length} raw items`)

  // 5) Parse + filter
  const parsed = rawItems
    .map(parseBookingReview)
    .filter((p) => p.reviewId)
  const seen = new Set()
  const unique = []
  for (const p of parsed) {
    const k = `booking::${p.reviewId}`
    if (seen.has(k)) continue
    seen.add(k)
    unique.push(p)
  }
  console.log(`[resync] Parsed ${parsed.length}, unique ${unique.length}`)

  // 6) Load existing reviewIds for diffing (info only; upsert handles it)
  const existing = await sb.get(
    `hotel_reviews?hotel_id=eq.${hotelId}&platform=eq.booking&select=review_id`
  )
  const existingSet = new Set(existing.map((e) => e.review_id))
  const newCount = unique.filter((u) => !existingSet.has(u.reviewId)).length
  console.log(`[resync] Existing ${existingSet.size}, new ${newCount}`)

  // 7) Upsert in batches of 100
  const BATCH = 100
  let imported = 0
  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH).map((p) => {
      const { value, originalRating, originalScale } = normalizeRating(p.rating, p.ratingScale)
      // NB: actor returns stayDate as a string like "3 nights · Stayed in Oct 2025"
      // which is NOT a valid DATE, so we null it out to avoid insert errors.
      // Likewise for response_date and review_date if they're not ISO-parseable.
      const asDate = (v) => {
        if (!v) return null
        const d = new Date(v)
        return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null
      }
      return {
        hotel_id: hotelId,
        platform: "booking",
        review_id: p.reviewId,
        author_name: p.authorName || null,
        text: p.text || null,
        title: p.title || null,
        rating: value,
        original_rating: originalRating,
        original_scale: originalScale,
        review_date: asDate(p.reviewDate),
        stay_date: asDate(p.stayDate),
        response_text: p.responseText || null,
        response_date: asDate(p.responseDate),
        language: p.language || null,
        source: "apify",
      }
    })
    try {
      await sb.upsert("hotel_reviews", chunk, "hotel_id,platform,review_id")
      imported += chunk.length
      console.log(`[resync] upserted ${imported}/${unique.length}`)
    } catch (e) {
      console.error("Upsert failed on batch", i, e.message)
    }
  }

  // 8) Update last_sync timestamp
  await sb.patch(
    "hotel_integrations",
    `hotel_id=eq.${hotelId}`,
    {
      booking_com_last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  )

  console.log(`\n[resync] DONE. Booking reviews in DB: ${existingSet.size} → ${existingSet.size + newCount} (+${newCount} new, ${imported - newCount} refreshed)`)
  console.log(`[resync] Note: AI sentiment/topics for NEW reviews will be added next time`)
  console.log(`[resync] the regular sync runs (incremental), or via a dedicated reprocess job.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
