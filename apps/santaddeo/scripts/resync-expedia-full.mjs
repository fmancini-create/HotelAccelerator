/**
 * One-off: force a FULL Expedia resync (up to 2000 reviews) for a single hotel,
 * bypassing both the Vercel 5-minute function timeout and the service's
 * automatic incremental-mode detection.
 *
 * Usage (env must be loaded from /vercel/share/.env.project):
 *   node --env-file-if-exists=/vercel/share/.env.project \
 *     scripts/resync-expedia-full.mjs <hotelId>
 *
 * Required env:
 *   APIFY_API_TOKEN
 *   NEXT_PUBLIC_SUPABASE_URL (falls back to the Santaddeo project URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://aeynirkfixurikshxfov.supabase.co"
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const hotelId = process.argv[2]
// Optional: resume an already-started Apify run instead of starting a new one.
// Pass RESUME_RUN_ID=xxx (and optionally RESUME_DATASET_ID=yyy) via env.
const RESUME_RUN_ID = process.env.RESUME_RUN_ID
const RESUME_DATASET_ID = process.env.RESUME_DATASET_ID
if (!hotelId) {
  console.error("Usage: node scripts/resync-expedia-full.mjs <hotelId>")
  process.exit(1)
}
if (!APIFY_API_TOKEN || !SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing env: APIFY_API_TOKEN / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"
  )
  process.exit(1)
}

// Same actor as the production service.
const EXPEDIA_ACTOR = "hello.datawizards~Expedia-Review-Scraper-Pro"
const MAX_REVIEWS = 2000

// --------------------- Safe JSON fetch (retries on HTML) --------------------
// Apify occasionally returns a Cloudflare/nginx HTML error page (502/503/504).
// We retry a few times instead of crashing the polling loop.
async function fetchJsonSafe(url, { tries = 5, delayMs = 5000 } = {}) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url)
      const text = await res.text()
      const trimmed = text.trimStart()
      if (trimmed.startsWith("<")) {
        lastErr = new Error(`Non-JSON response (status ${res.status}, body starts with '<')`)
      } else {
        try {
          return JSON.parse(text)
        } catch (e) {
          lastErr = new Error(`JSON parse failed: ${e.message}`)
        }
      }
    } catch (e) {
      lastErr = e
    }
    if (i < tries - 1) {
      console.warn(`[resync-expedia] fetch retry ${i + 1}/${tries - 1}: ${lastErr.message}`)
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw lastErr
}

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
function normalizeRating(rating, scale) {
  const originalRating = rating == null ? null : Number(rating)
  const originalScale = scale || 10
  if (originalRating == null || Number.isNaN(originalRating)) {
    return { value: null, originalRating: null, originalScale }
  }
  if (originalScale === 5) return { value: originalRating, originalRating, originalScale }
  return { value: originalRating / 2, originalRating, originalScale }
}

// ------------------------------ Expedia parser ------------------------------
/**
 * Must match lib/services/apify-review-service.ts parseReview for expedia.
 * Output shape from hello.datawizards~Expedia-Review-Scraper-Pro:
 *   { id, author, text, title, score: "10/10 Excellent",
 *     submission_time: "Oct 1, 2025", management_response,
 *     stay_duration, trip_type, sentiments }
 */
function parseExpediaReview(r) {
  const ratingFromScore = (() => {
    if (typeof r.score === "number") return r.score
    if (typeof r.score === "string") {
      const m = r.score.match(/(\d+(?:\.\d+)?)/)
      return m ? parseFloat(m[1]) : undefined
    }
    return r.rating ?? r.overallRating
  })()
  return {
    reviewId:
      r.id ||
      r.reviewId ||
      (r.submission_time
        ? `expedia_${r.submission_time}_${String(r.author || "").slice(0, 12)}`
        : undefined),
    authorName: r.author || r.authorName || r.guestName,
    text: r.text || r.reviewText || r.review,
    title: r.title || r.reviewTitle,
    rating: ratingFromScore,
    ratingScale: 10,
    reviewDate: r.submission_time || r.reviewDate || r.date || r.publishedDate,
    stayDate: r.stay_duration || r.stayDate,
    responseText: r.management_response || r.response || r.hotelResponse,
    language: r.language,
  }
}

// --------------------------- Main ---------------------------
async function main() {
  console.log(`[resync-expedia] hotelId=${hotelId} target=${MAX_REVIEWS} reviews`)

  // 1) Load integration
  const integRows = await sb.get(
    `hotel_integrations?hotel_id=eq.${hotelId}&select=expedia_url`
  )
  if (!integRows?.[0]?.expedia_url) {
    console.error("No expedia_url configured for this hotel.")
    process.exit(1)
  }
  const expediaUrl = integRows[0].expedia_url
  console.log(`[resync-expedia] Expedia URL: ${expediaUrl}`)

  // 2) Start a new Apify run — OR resume an existing one to avoid paying twice.
  let runId, datasetId
  if (RESUME_RUN_ID) {
    runId = RESUME_RUN_ID
    console.log(`[resync-expedia] Resuming existing run ${runId}`)
    const existing = await fetchJsonSafe(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_TOKEN}`
    )
    datasetId = RESUME_DATASET_ID || existing?.data?.defaultDatasetId
    if (!datasetId) {
      console.error("Could not resolve datasetId for resume. Pass RESUME_DATASET_ID.")
      process.exit(1)
    }
    console.log(`[resync-expedia] datasetId=${datasetId}`)
  } else {
    const input = {
      Urls: [expediaUrl],
      ItemLimit: Math.max(MAX_REVIEWS, 50), // minimum enforced by the actor
    }
    console.log(`[resync-expedia] Starting Apify actor ${EXPEDIA_ACTOR}...`)
    const startRes = await fetch(
      `https://api.apify.com/v2/acts/${EXPEDIA_ACTOR}/runs?token=${APIFY_API_TOKEN}`,
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
    runId = start.data.id
    datasetId = start.data.defaultDatasetId
    console.log(`[resync-expedia] runId=${runId}  datasetId=${datasetId}`)
  }

  // 3) Poll until done (no time limit; CLI context)
  let status = "RUNNING"
  let polls = 0
  while (!/SUCCEEDED|FAILED|ABORTED|TIMED-OUT/.test(status)) {
    await new Promise((r) => setTimeout(r, 10_000))
    polls++
    try {
      const j = await fetchJsonSafe(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_TOKEN}`
      )
      status = j?.data?.status ?? status
      const cnt = j?.data?.stats?.outputItemCount ?? "?"
      console.log(`[resync-expedia] poll ${polls} (${polls * 10}s): ${status}  items=${cnt}`)
    } catch (e) {
      console.warn(`[resync-expedia] poll ${polls} transient error: ${e.message}`)
    }
  }
  if (status !== "SUCCEEDED") {
    console.error(`Apify run ended with status ${status}, aborting.`)
    process.exit(1)
  }

  // 4) Fetch dataset (robust)
  const rawItems = await fetchJsonSafe(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_TOKEN}&clean=true`
  )
  console.log(`[resync-expedia] Downloaded ${rawItems.length} raw items`)

  // 5) Parse + dedup
  const parsed = rawItems.map(parseExpediaReview).filter((p) => p.reviewId)
  const seen = new Set()
  const unique = []
  for (const p of parsed) {
    const k = `expedia::${p.reviewId}`
    if (seen.has(k)) continue
    seen.add(k)
    unique.push(p)
  }
  console.log(`[resync-expedia] Parsed ${parsed.length}, unique ${unique.length}`)

  // 6) Existing for reporting
  const existing = await sb.get(
    `hotel_reviews?hotel_id=eq.${hotelId}&platform=eq.expedia&select=review_id`
  )
  const existingSet = new Set(existing.map((e) => e.review_id))
  const newCount = unique.filter((u) => !existingSet.has(u.reviewId)).length
  console.log(`[resync-expedia] Existing ${existingSet.size}, new ${newCount}`)

  // 7) Upsert in batches of 100
  const asDate = (v) => {
    if (!v) return null
    const d = new Date(v)
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null
  }
  const BATCH = 100
  let imported = 0
  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH).map((p) => {
      const { value, originalRating, originalScale } = normalizeRating(p.rating, p.ratingScale)
      return {
        hotel_id: hotelId,
        platform: "expedia",
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
        response_date: null,
        language: p.language || null,
        source: "apify",
      }
    })
    try {
      await sb.upsert("hotel_reviews", chunk, "hotel_id,platform,review_id")
      imported += chunk.length
      console.log(`[resync-expedia] upserted ${imported}/${unique.length}`)
    } catch (e) {
      console.error("Upsert failed on batch", i, e.message)
    }
  }

  // 8) Update last_sync timestamp (if column exists)
  try {
    await sb.patch("hotel_integrations", `hotel_id=eq.${hotelId}`, {
      expedia_last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  } catch (e) {
    console.warn(`[resync-expedia] last_sync update failed (non-fatal):`, e.message)
  }

  console.log(
    `\n[resync-expedia] DONE. Expedia reviews in DB: ${existingSet.size} → ${
      existingSet.size + newCount
    } (+${newCount} new, ${imported - newCount} refreshed)`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
