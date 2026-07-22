import { createServiceRoleClient } from "@/lib/supabase/server"
import { generateObject } from "ai"
import { z } from "zod"
import { notifyHotelUsersByPreference } from "@/lib/notifications/notify"
import { autoMatchReview } from "@/lib/reviews/booking-match"

/**
 * Multi-platform Apify review scraper client + sync pipeline.
 *
 * Supported platforms:
 *  - Google Maps: compass/google-maps-reviews-scraper
 *  - Booking.com: voyager/booking-reviews-scraper  
 *  - TripAdvisor: maxcopell/tripadvisor-reviews
 *  - Expedia: hello.datawizards/Expedia-Review-Scraper-Pro
 *
 * Responsibilities:
 *  - Call appropriate Apify actor for each configured platform
 *  - Normalize ratings to a 1..5 scale
 *  - Upsert into `hotel_reviews` using (hotel_id, platform, review_id) as key
 *  - Enrich NEW reviews with lightweight AI sentiment + topic extraction
 *  - Recompute `review_stats` daily snapshot for the hotel
 */

// How many reviews to fetch per run.
// - FULL: used on the FIRST sync for a hotel/platform (empty table).
//   We cap at 500 across all platforms because the Vercel function timeout
//   is 5 minutes and Booking/Expedia actors are particularly slow on first
//   bootstrap (a 2000-review run on Booking can easily exceed 5 minutes,
//   triggering FUNCTION_INVOCATION_TIMEOUT — observed on Tenuta Massabò
//   29/04/2026). Hotels that need a deeper history bootstrap (>500) use
//   `scripts/resync-booking-full.mjs` / `resync-expedia-full.mjs` which run
//   from the CLI and are not bound by the serverless 300s limit.
// - INCREMENTAL: used on subsequent syncs. A small buffer is enough to catch
//   newly posted reviews since the last run. Each hotel typically receives
//   0-5 reviews per day per platform, so 40 is a very safe window even on a
//   weekly schedule. This is the key cost-saving lever: scrapers bill
//   per-review, so we never want to re-download everything just to dedup.
const FULL_SYNC_MAX = {
  google: 500,
  tripadvisor: 500,
  vrbo: 300,
  airbnb: 300,
  booking: 500,
  expedia: 500,
} as const
const INCREMENTAL_SYNC_MAX = 40
// The Expedia Pro actor enforces a minimum of 50 items per run. We apply
// the same floor to every platform's incremental requests so the sort-by-
// newest window stays usable and we never hit per-actor validation errors.
const MIN_SYNC_ITEMS = 50

// Apify actor configuration per platform.
// `buildInput` takes a flag telling whether this is the first sync or an
// incremental run, and returns a payload that asks the scraper to return
// reviews in reverse chronological order (newest first) so that the small
// incremental window is most likely to contain any new reviews.
const PLATFORM_ACTORS = {
  google: {
    actorId: "compass~google-maps-reviews-scraper",
    buildInput: (config: PlatformConfig, isIncremental: boolean) => ({
      placeIds: config.placeId ? [config.placeId] : [],
      maxReviews: isIncremental ? INCREMENTAL_SYNC_MAX : FULL_SYNC_MAX.google,
      reviewsSort: "newest",
      language: "it",
    }),
    parseReview: (r: any) => ({
      reviewId: r.reviewId,
      authorName: r.name,
      text: r.text,
      rating: r.stars ?? r.rating,
      ratingScale: 5,
      reviewDate: r.publishedAtDate,
      responseText: r.responseFromOwnerText,
      responseDate: r.responseFromOwnerDate,
      language: r.language || r.originalLanguage,
    }),
  },
  booking: {
    actorId: "voyager~booking-reviews-scraper",
    buildInput: (config: PlatformConfig, isIncremental: boolean) => ({
      // The voyager actor expects `startUrls` (array of objects with `.url`).
      // The previous `hotelUrls` field is no longer supported.
      startUrls: config.url ? [{ url: config.url }] : [],
      maxReviewsPerHotel: isIncremental ? INCREMENTAL_SYNC_MAX : FULL_SYNC_MAX.booking,
      // Supported: f_relevance | f_recent_desc | f_recent_asc | f_score_desc | f_score_asc
      sortReviewsBy: "f_recent_desc",
    }),
    parseReview: (r: any) => {
      // Real output shape from voyager~booking-reviews-scraper (2026):
      // { id, userName, userLocation, rating (0-10), reviewTitle,
      //   likedText, dislikedText, propertyResponse, checkInDate,
      //   checkOutDate, reviewDate, reviewLanguage, travelerType, ... }
      const liked = r.likedText || r.positive
      const disliked = r.dislikedText || r.negative
      // Booking separates each review into what the guest liked vs disliked.
      // We merge them into one text blob so downstream sentiment/topic
      // extraction sees the full picture.
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
        ratingScale: 10, // Booking uses 1-10
        reviewDate: r.reviewDate || r.date,
        stayDate: r.checkInDate || r.stayDate,
        responseText: r.propertyResponse || r.response?.text || r.hotelResponse,
        responseDate: r.propertyResponseDate || r.response?.date,
        language: r.reviewLanguage || r.language,
      }
    },
  },
  tripadvisor: {
    actorId: "maxcopell~tripadvisor-reviews",
    buildInput: (config: PlatformConfig, isIncremental: boolean) => ({
      startUrls: config.url ? [{ url: config.url }] : [],
      maxReviews: isIncremental ? INCREMENTAL_SYNC_MAX : FULL_SYNC_MAX.tripadvisor,
      // maxcopell actor defaults to newest-first but we pass it explicitly
      reviewsSortOrder: "mostRecent",
      language: "it",
    }),
    parseReview: (r: any) => ({
      reviewId: r.id || r.reviewId,
      authorName: r.user?.username || r.author,
      text: r.text || r.review,
      title: r.title,
      rating: r.rating || r.bubbleRating,
      ratingScale: 5,
      reviewDate: r.publishedDate || r.date,
      stayDate: r.stayDate || r.tripDate,
      responseText: r.ownerResponse?.text,
      responseDate: r.ownerResponse?.date,
      language: r.language,
    }),
  },
  vrbo: {
    // Default Apify actor for VRBO review scraping. Overridable via env var
    // APIFY_ACTOR_VRBO if we ever need to switch supplier without redeploying.
    //
    // INCIDENT 26/05/2026: l'actor di default precedente "epctex~vrbo-scraper"
    // e' stato rimosso da Apify Store ("Actor with this name was not found").
    // Sostituito con "powerai~vrbo-reviews-scraper" (100% success rate, attivo,
    // schema stabile). Schema input: { searchUrl: string, maxItems: int 1..1000,
    // proxyConfiguration?: object }. Lo schema output usa i campi
    // reviewId/rating/ratingMax/author/reviewText/stayedText/travelType/
    // isVerified/scrapedAt — i fallback sotto coprono comunque le varianti
    // storiche (review/reviewDate/...) per non perdere dati se cambiamo
    // ancora actor via env.
    //
    // Parser is intentionally defensive because VRBO actors on Apify vary
    // quite a bit in field naming; we accept the most common aliases.
    actorId: process.env.APIFY_ACTOR_VRBO || "powerai~vrbo-reviews-scraper",
    buildInput: (config: PlatformConfig, isIncremental: boolean) => {
      const max = isIncremental ? INCREMENTAL_SYNC_MAX : FULL_SYNC_MAX.vrbo
      return {
        // powerai~vrbo-reviews-scraper expects `searchUrl` (single string, not
        // array). We also keep startUrls/urls/maxReviews as legacy fallbacks
        // so an env-var override toward another actor still works without a
        // code change.
        searchUrl: config.url || "",
        maxItems: max,
        startUrls: config.url ? [{ url: config.url }] : [],
        urls: config.url ? [config.url] : [],
        maxReviews: max,
        sortBy: "newest",
        includeReviews: true,
      }
    },
    parseReview: (r: any) => ({
      reviewId:
        r.reviewId ||
        r.id ||
        r.review_id ||
        `vrbo_${r.reviewDate || r.date || r.submissionDate || r.scrapedAt}_${String(
          r.author || r.authorName || r.reviewer || ""
        ).slice(0, 12)}`,
      authorName: r.author || r.authorName || r.reviewer || r.userName,
      text: r.reviewText || r.text || r.review || r.body,
      title: r.title || r.reviewTitle || r.ratingLabel,
      // PowerAI returns rating on a 1..10 scale (ratingMax=10). When ratingMax
      // is present, we forward both so the caller can normalise; when only
      // `rating` is exposed without ratingMax, we keep the old 1..5 default.
      rating: r.rating ?? r.score ?? r.stars,
      ratingScale: typeof r.ratingMax === "number" ? r.ratingMax : 5,
      reviewDate:
        r.reviewDate ||
        r.date ||
        r.submissionDate ||
        r.publishedDate ||
        r.scrapedAt,
      stayDate: r.stayDate || r.tripDate || r.stayedText,
      responseText: r.hostResponse || r.ownerResponse || r.managementResponse,
      responseDate: r.hostResponseDate || r.ownerResponseDate,
      language: r.language,
    }),
  },
  airbnb: {
    // Default Apify actor for Airbnb listing review scraping. Overridable via
    // env var APIFY_ACTOR_AIRBNB. Note that Airbnb pages are "listings"
    // rather than hotel property pages; the configured URL must be the
    // listing URL (https://www.airbnb.com/rooms/...).
    actorId: process.env.APIFY_ACTOR_AIRBNB || "tri_angle~airbnb-reviews-scraper",
    buildInput: (config: PlatformConfig, isIncremental: boolean) => ({
      startUrls: config.url ? [{ url: config.url }] : [],
      urls: config.url ? [config.url] : [],
      maxReviews: isIncremental ? INCREMENTAL_SYNC_MAX : FULL_SYNC_MAX.airbnb,
      maxItems: isIncremental ? INCREMENTAL_SYNC_MAX : FULL_SYNC_MAX.airbnb,
      // tri_angle~airbnb-reviews-scraper valida sortBy contro un enum con il
      // TRATTINO: "most-recent" | "most-relevant" | "highest-rated" |
      // "lowest-rated". Con l'underscore ("most_recent") il run fallisce con
      // invalid-input prima ancora di partire (incident 30/05/2026).
      sortBy: "most-recent",
    }),
    parseReview: (r: any) => ({
      reviewId:
        r.id ||
        r.reviewId ||
        r.review_id ||
        `airbnb_${r.createdAt || r.date}_${String(
          r.reviewer?.firstName || r.author || r.authorName || ""
        ).slice(0, 12)}`,
      authorName:
        r.reviewer?.firstName ||
        [r.reviewer?.firstName, r.reviewer?.lastName].filter(Boolean).join(" ") ||
        r.author ||
        r.authorName ||
        r.userName,
      text: r.comments || r.text || r.review || r.reviewText,
      // Airbnb displays 1-5 star ratings; some actors expose them as `rating`
      // and others hide them (only localized review text is guaranteed).
      rating: r.rating ?? r.stars ?? r.score,
      ratingScale: 5,
      reviewDate: r.createdAt || r.date || r.reviewDate || r.publishedDate,
      stayDate: r.stayDate || r.tripDate,
      responseText: r.response || r.hostResponse,
      responseDate: r.responseDate || r.hostResponseDate,
      language: r.language,
    }),
  },
  expedia: {
    // We tried memo23~expedia-scraper first but it has a broken startup that
    // crashes with 429 Too Many Requests trying to ping the author on Telegram
    // before scraping even begins, so every run FAILs.
    // hello.datawizards~Expedia-Review-Scraper-Pro is a paid actor ($5/1k
    // items, pay-per-result) that actually works. The minimum ItemLimit
    // accepted is 50 — we enforce that here.
    actorId: "hello.datawizards~Expedia-Review-Scraper-Pro",
    buildInput: (config: PlatformConfig, isIncremental: boolean) => {
      const desired = isIncremental ? INCREMENTAL_SYNC_MAX : FULL_SYNC_MAX.expedia
      return {
        // Note: this actor uses capitalized keys.
        Urls: config.url ? [config.url] : [],
        ItemLimit: Math.max(desired, MIN_SYNC_ITEMS),
      }
    },
    parseReview: (r: any) => ({
      // Output format: { id, author, text, title, score: "10/10 Excellent",
      //                  submission_time: "Oct 1, 2025", management_response,
      //                  stay_duration, trip_type, sentiments }
      reviewId:
        r.id ||
        r.reviewId ||
        (r.submission_time
          ? `expedia_${r.submission_time}_${String(r.author || "").slice(0, 12)}`
          : undefined),
      authorName: r.author || r.authorName || r.guestName,
      text: r.text || r.reviewText || r.review,
      title: r.title || r.reviewTitle,
      // `score` arrives as a string "10/10 Excellent" — extract the number
      rating: (() => {
        if (typeof r.score === "number") return r.score
        if (typeof r.score === "string") {
          const m = r.score.match(/(\d+(?:\.\d+)?)/)
          return m ? parseFloat(m[1]) : undefined
        }
        return r.rating ?? r.overallRating
      })(),
      ratingScale: 10, // Expedia uses 0-10
      reviewDate: r.submission_time || r.reviewDate || r.date || r.publishedDate,
      stayDate: r.stay_duration || r.stayDate,
      responseText: r.management_response || r.response || r.hotelResponse,
      language: r.language,
    }),
  },
} as const

type PlatformKey = keyof typeof PLATFORM_ACTORS

interface PlatformConfig {
  placeId?: string
  url?: string
  maxReviews?: number
}

interface NormalizedReview {
  reviewId: string
  authorName?: string
  text?: string
  title?: string
  rating?: number
  ratingScale?: number
  reviewDate?: string
  stayDate?: string
  responseText?: string
  responseDate?: string
  language?: string
}

// === Rating normalization =================================================
function normalizeRating(
  rating: number | null | undefined,
  ratingScale: number = 5
): { value: number | null; originalRating: number | null; originalScale: number | null } {
  if (rating == null || !Number.isFinite(rating)) {
    return { value: null, originalRating: null, originalScale: null }
  }
  const scale = ratingScale || (rating > 5.01 ? 10 : 5)
  const normalized = scale === 10 ? rating / 2 : rating
  const clamped = Math.max(0, Math.min(5, normalized))
  return {
    value: Number(clamped.toFixed(2)),
    originalRating: rating,
    originalScale: scale,
  }
}

// === AI sentiment + topics ===============================================
const ReviewAnalysisSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int(),
      sentiment: z.enum(["positive", "neutral", "negative"]),
      topics: z.array(z.string()).max(6),
    })
  ),
})

async function enrichReviewsWithAI(
  reviews: Array<{ text: string; rating: number | null }>
): Promise<Array<{ sentiment: "positive" | "neutral" | "negative"; topics: string[] }>> {
  if (reviews.length === 0) return []

  const fallback = reviews.map((r) => ({
    sentiment:
      r.rating == null ? ("neutral" as const) : r.rating >= 4 ? ("positive" as const) : r.rating <= 2.5 ? ("negative" as const) : ("neutral" as const),
    topics: [] as string[],
  }))

  try {
    const numbered = reviews
      .map((r, i) => `#${i}: [${r.rating ?? "?"}★] ${(r.text || "").slice(0, 500)}`)
      .join("\n")

    const { object } = await generateObject({
      model: "openai/gpt-4o-mini",
      schema: ReviewAnalysisSchema,
      prompt:
        `For each of the following hotel reviews, classify its sentiment ` +
        `(positive/neutral/negative) and extract up to 6 short topic keywords ` +
        `(e.g. "cleanliness", "staff", "breakfast", "wifi", "location", "noise", ` +
        `"value", "bathroom"). Respond ONLY with a JSON array. Do not invent ` +
        `topics that aren't present in the text.\n\n${numbered}`,
      abortSignal: AbortSignal.timeout(45_000),
    })

    for (const r of object.results) {
      if (r.index >= 0 && r.index < fallback.length) {
        fallback[r.index] = {
          sentiment: r.sentiment,
          topics: r.topics.map((t) => t.toLowerCase().trim()).filter(Boolean).slice(0, 6),
        }
      }
    }
  } catch (err) {
    console.error("[ApifyReviewService] AI sentiment batch failed:", err)
  }

  return fallback
}

export class ApifyReviewService {
  private apiToken: string

  constructor(apiToken: string) {
    this.apiToken = apiToken
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(
        `https://api.apify.com/v2/acts/compass~google-maps-reviews-scraper?token=${this.apiToken}`
      )
      if (!response.ok) {
        if (response.status === 401) return { success: false, message: "Invalid API token" }
        return { success: false, message: `API error: ${response.statusText}` }
      }
      return { success: true, message: "Connection successful" }
    } catch (error) {
      return { success: false, message: "Failed to connect to Apify API" }
    }
  }

  /**
   * Start an actor run for a specific platform.
   * `isIncremental` controls how many reviews are requested:
   *   - first sync (no existing reviews): full dump (500)
   *   - subsequent syncs: small window of newest reviews (40)
   * This is critical because Apify bills per-review scraped, not per-run.
   */
  async startPlatformRun(
    platform: PlatformKey,
    config: PlatformConfig,
    isIncremental: boolean
  ) {
    const actor = PLATFORM_ACTORS[platform]
    const body = actor.buildInput(config, isIncremental)
    
    const response = await fetch(
      `https://api.apify.com/v2/acts/${actor.actorId}/runs?token=${this.apiToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    )
    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText)
      return { success: false as const, message: `Failed to start ${platform} run: ${errText}` }
    }
    const data = await response.json()
    return { 
      success: true as const, 
      runId: data.data.id as string,
      datasetId: data.data.defaultDatasetId as string 
    }
  }

  async getRunStatus(runId: string) {
    const response = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${this.apiToken}`)
    if (!response.ok) return { success: false as const }
    const data = await response.json()
    return { success: true as const, status: data.data.status as string }
  }

  async getRunResults(datasetId: string): Promise<any[]> {
    const response = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${this.apiToken}`
    )
    if (!response.ok) throw new Error(`Failed to get results: ${response.statusText}`)
    return await response.json()
  }

  /**
   * Poll for run completion (max 5 minutes)
   */
  async waitForCompletion(runId: string, maxIterations = 60): Promise<string> {
    let status = "RUNNING"
    for (let i = 0; i < maxIterations && (status === "RUNNING" || status === "READY"); i++) {
      await new Promise((r) => setTimeout(r, 5000))
      const s = await this.getRunStatus(runId)
      if (s.success && s.status) status = s.status
    }
    return status
  }

  /**
   * Sync reviews from a single platform
   */
  async syncPlatform(
    hotelId: string,
    platform: PlatformKey,
    config: PlatformConfig,
    existingSet: Set<string>,
    options: { forceFull?: boolean } = {}
  ): Promise<{ reviews: any[]; newCount: number; error?: string }> {
    const actor = PLATFORM_ACTORS[platform]

    // Incremental sync whenever we already have at least one review for this
    // (hotel, platform). We only scrape FULL_SYNC_MAX the very first time,
    // unless the caller explicitly requests a forceFull (e.g. to backfill
    // missing fields after a parser fix).
    const isIncremental = !options.forceFull && existingSet.size > 0

    console.log(
      `[ApifyReviewService] Starting ${platform} sync (${
        isIncremental
          ? `incremental ≤${INCREMENTAL_SYNC_MAX}`
          : `full ≤${FULL_SYNC_MAX[platform]}${options.forceFull ? " FORCED" : ""}`
      }, ${existingSet.size} existing)...`
    )
    const startResult = await this.startPlatformRun(platform, config, isIncremental)
    if (!startResult.success) {
      console.error(`[ApifyReviewService] Failed to start ${platform}:`, startResult.message)
      // Surface the most common Apify failures with a friendly message
      const raw = startResult.message || ""
      let friendly = raw
      if (/Monthly usage hard limit/i.test(raw)) {
        friendly =
          "Limite mensile di utilizzo Apify raggiunto. Aumenta il piano o l'usage limit su console.apify.com/billing."
      } else if (/invalid-token|authentication/i.test(raw)) {
        friendly = "Token Apify non valido. Controllalo nelle impostazioni."
      } else if (/not-found|does not exist/i.test(raw)) {
        friendly = `Actor ${platform} non trovato o non accessibile con questo token.`
      }
      return { reviews: [], newCount: 0, error: friendly }
    }

    const status = await this.waitForCompletion(startResult.runId)
    if (status !== "SUCCEEDED") {
      console.error(`[ApifyReviewService] ${platform} run ended with status:`, status)
      return {
        reviews: [],
        newCount: 0,
        error: `Esecuzione Apify terminata con stato ${status} (normalmente l'URL non e' supportato o l'actor ha fallito).`,
      }
    }

    const rawReviews = await this.getRunResults(startResult.datasetId)
    console.log(`[ApifyReviewService] ${platform} returned ${rawReviews.length} reviews`)

    const normalized = rawReviews
      .map((r) => actor.parseReview(r))
      .filter((r): r is NormalizedReview => !!r.reviewId)
      .map((r) => {
        const { value, originalRating, originalScale } = normalizeRating(r.rating, r.ratingScale)
        const isNew = !existingSet.has(`${platform}::${r.reviewId}`)
        return {
          hotel_id: hotelId,
          platform,
          review_id: String(r.reviewId),
          author_name: r.authorName || null,
          rating: value,
          original_rating: originalRating,
          original_scale: originalScale,
          title: r.title || null,
          text: r.text || null,
          language: r.language || null,
          review_date: r.reviewDate ? String(r.reviewDate).slice(0, 10) : null,
          stay_date: r.stayDate ? String(r.stayDate).slice(0, 10) : null,
          response_text: r.responseText || null,
          response_date: r.responseDate ? String(r.responseDate).slice(0, 10) : null,
          raw_data: r,
          source: "apify",
          updated_at: new Date().toISOString(),
          _isNew: isNew,
        }
      })

    return { 
      reviews: normalized, 
      newCount: normalized.filter(r => r._isNew).length 
    }
  }

  /**
   * Resolve the Apify token to use for a given hotel.
   * Priority:
   *   1) Global env var APIFY_API_TOKEN (shared SaaS account)
   *   2) Per-tenant token saved in hotel_integrations.apify_api_token (fallback,
   *      for customers who want to use their own Apify account)
   */
  private static resolveApifyToken(perTenantToken: string | null | undefined): string | null {
    const envToken = process.env.APIFY_API_TOKEN?.trim()
    if (envToken) return envToken
    const tenantToken = perTenantToken?.trim()
    if (tenantToken) return tenantToken
    return null
  }

  /**
   * Load hotel integrations and return the list of configured platforms.
   * Does NOT require a per-tenant Apify token anymore — the global
   * APIFY_API_TOKEN env var is used by default.
   */
  static async getConfiguredPlatforms(
    hotelId: string
  ): Promise<{ success: boolean; message?: string; platforms?: PlatformKey[] }> {
    const supabase = await createServiceRoleClient()
    const { data: integ, error: integErr } = await supabase
      .from("hotel_integrations")
      .select(
        `apify_api_token, google_maps_place_id, booking_com_url, tripadvisor_url, expedia_url, vrbo_url, airbnb_url`
      )
      .eq("hotel_id", hotelId)
      .maybeSingle()

    if (integErr) return { success: false, message: integErr.message }
    if (!integ) return { success: false, message: "Integrations not configured for this hotel" }

    if (!this.resolveApifyToken(integ.apify_api_token)) {
      return {
        success: false,
        message:
          "Token Apify non configurato. L'amministratore deve impostare la variabile d'ambiente APIFY_API_TOKEN.",
      }
    }

    const platforms: PlatformKey[] = []
    if (integ.google_maps_place_id) platforms.push("google")
    if (integ.booking_com_url) platforms.push("booking")
    if (integ.tripadvisor_url) platforms.push("tripadvisor")
    if (integ.expedia_url) platforms.push("expedia")
    if (integ.vrbo_url) platforms.push("vrbo")
    if (integ.airbnb_url) platforms.push("airbnb")
    return { success: true, platforms }
  }

  /**
   * Sync reviews for a SINGLE platform. Designed to fit within serverless
   * execution limits (~60-120s per platform). The client calls this once
   * per configured platform in sequence.
   */
  static async syncSinglePlatformForHotel(
    hotelId: string,
    platform: PlatformKey,
    options: { forceFull?: boolean } = {}
  ): Promise<{ success: boolean; message: string; reviewCount?: number; newCount?: number; platform: string }> {
    const supabase = await createServiceRoleClient()

    try {
      const { data: integ, error: integErr } = await supabase
        .from("hotel_integrations")
        .select(`
          apify_api_token,
          google_maps_place_id,
          booking_com_url,
          tripadvisor_url,
          expedia_url,
          vrbo_url,
          airbnb_url
        `)
        .eq("hotel_id", hotelId)
        .maybeSingle()

      if (integErr) return { success: false, message: integErr.message, platform }
      if (!integ) return { success: false, message: "Integrations not configured for this hotel", platform }

      // Prefer the shared SaaS token (env var), fallback to per-tenant token
      const apiToken = ApifyReviewService.resolveApifyToken(integ.apify_api_token)
      if (!apiToken) {
        return {
          success: false,
          message:
            "Token Apify non configurato. L'amministratore deve impostare la variabile d'ambiente APIFY_API_TOKEN.",
          platform,
        }
      }

      // Build config for this specific platform
      let config: PlatformConfig | null = null
      if (platform === "google" && integ.google_maps_place_id) {
        config = { placeId: integ.google_maps_place_id }
      } else if (platform === "booking" && integ.booking_com_url) {
        config = { url: integ.booking_com_url }
      } else if (platform === "tripadvisor" && integ.tripadvisor_url) {
        config = { url: integ.tripadvisor_url }
      } else if (platform === "expedia" && integ.expedia_url) {
        config = { url: integ.expedia_url }
      } else if (platform === "vrbo" && integ.vrbo_url) {
        config = { url: integ.vrbo_url }
      } else if (platform === "airbnb" && integ.airbnb_url) {
        config = { url: integ.airbnb_url }
      }

      if (!config) {
        return {
          success: true,
          message: `Piattaforma ${platform} non configurata, saltata`,
          reviewCount: 0,
          newCount: 0,
          platform,
        }
      }

      // Existing reviews for de-dup (only for this platform to keep query light).
      //
      // IMPORTANT: PostgREST caps a single response at ~1000 rows by default.
      // Hotels with >1000 reviews on a platform (e.g. Villa I Barronci has 2130
      // on Booking) would otherwise get a truncated existingSet, so review_ids
      // already stored beyond row 1000 are re-flagged as "new" on every run,
      // inflating newCount and the notification email ("21 nuove recensioni"
      // when only 2 were actually new). Paginate with .range() until exhausted
      // so the de-dup set contains every existing review_id.
      const existingSet = new Set<string>()
      const PAGE_SIZE = 1000
      let from = 0
      while (true) {
        const { data: existingReviews, error: existingError } = await supabase
          .from("hotel_reviews")
          .select("review_id")
          .eq("hotel_id", hotelId)
          .eq("platform", platform)
          .range(from, from + PAGE_SIZE - 1)

        if (existingError) {
          console.error(
            `[reviews] existingSet pagination error for hotel ${hotelId} / ${platform}: ${existingError.message}`
          )
          break
        }

        const batch = existingReviews || []
        for (const e of batch) {
          existingSet.add(`${platform}::${e.review_id}`)
        }

        if (batch.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }

      const service = new ApifyReviewService(apiToken)
      const { reviews, error: platformError } = await service.syncPlatform(
        hotelId,
        platform,
        config,
        existingSet,
        { forceFull: options.forceFull }
      )

      // If the upstream Apify call failed (quota, auth, bad URL, actor down...),
      // surface the real reason instead of silently reporting "0 reviews".
      // Also skip updating last_sync so the UI doesn't mark this platform as
      // recently synced when in fact nothing was pulled.
      if (platformError) {
        return {
          success: false,
          message: `${platform}: ${platformError}`,
          reviewCount: 0,
          newCount: 0,
          platform,
        }
      }

      // Enrich NEW reviews with AI sentiment in batches of 15
      const newReviews = reviews.filter((r: any) => r._isNew && r.text && r.text.length >= 15)
      const CHUNK = 15
      for (let i = 0; i < newReviews.length; i += CHUNK) {
        const batch = newReviews.slice(i, i + CHUNK)
        const enriched = await enrichReviewsWithAI(
          batch.map((b: any) => ({ text: b.text || "", rating: b.rating }))
        )
        for (let j = 0; j < batch.length; j++) {
          ;(batch[j] as any).sentiment = enriched[j]?.sentiment || "neutral"
          ;(batch[j] as any).topics = enriched[j]?.topics || []
        }
      }

      // Rating-only sentiment for short reviews
      for (const r of reviews.filter((x: any) => x._isNew && !(x.text && x.text.length >= 15))) {
        const rating = (r as any).rating || 0
        ;(r as any).sentiment =
          rating >= 4 ? "positive" : rating > 0 && rating <= 2.5 ? "negative" : "neutral"
        ;(r as any).topics = []
      }

      // Upsert reviews
      let importedCount = 0
      let newCount = 0
      // Manteniamo i metadati dei review NUOVI inseriti con successo per il
      // fan-out di notifiche piu' sotto. Conserviamo solo quanto serve per
      // costruire il body della notifica (autore, rating, dedup_key, ecc).
      const insertedNewReviews: Array<{
        review_id: string
        author_name: string | null
        rating: number | null
        text: string | null
      }> = []
      for (const row of reviews) {
        const { _isNew, ...rest } = row as any
        const insert = _isNew
          ? rest
          : Object.fromEntries(
              Object.entries(rest).filter(([k]) => k !== "sentiment" && k !== "topics")
            )
        const { error } = await supabase
          .from("hotel_reviews")
          .upsert(insert, { onConflict: "hotel_id,platform,review_id" })
        if (!error) {
          importedCount++
          if (_isNew) {
            newCount++
            insertedNewReviews.push({
              review_id: String((rest as any).review_id ?? ""),
              author_name: (rest as any).author_name ?? null,
              rating: (rest as any).rating ?? null,
              text: (rest as any).text ?? null,
            })
          }
        }
      }

      // ----------------------------------------------------------------------
      // AUTO-MATCH RECENSIONE -> PRENOTAZIONE -> TIPOLOGIA CAMERA (best-effort)
      // Per le recensioni NUOVE proviamo ad associare in automatico, in modo
      // prudente, la prenotazione (e quindi la tipologia camera). Non blocca la
      // sync e non sovrascrive mai associazioni manuali (autoMatchReview filtra
      // su match_source is null).
      // ----------------------------------------------------------------------
      try {
        if (insertedNewReviews.length > 0) {
          const newIds = insertedNewReviews.map((r) => r.review_id).filter(Boolean)
          if (newIds.length > 0) {
            const { data: freshRows } = await supabase
              .from("hotel_reviews")
              .select("id, hotel_id, author_name, stay_date")
              .eq("hotel_id", hotelId)
              .eq("platform", platform)
              .in("review_id", newIds)
              .is("match_source", null)
            for (const r of freshRows ?? []) {
              if (!r.stay_date) continue // senza data niente auto-match prudente
              await autoMatchReview(r as any)
            }
          }
        }
      } catch (e) {
        console.log("[v0] auto-match recensioni: errore non bloccante", (e as Error)?.message)
      }

      // ----------------------------------------------------------------------
      // NOTIFICA RIEPILOGO NUOVE RECENSIONI (opt-in)
      // La sync gira ~1 volta al giorno per canale: invece di una notifica/email
      // PER OGNI recensione (flood, specie alla FULL sync iniziale da 500), si
      // invia UNA sola notifica di riepilogo per questa sync di piattaforma,
      // con conteggio, media voti e anteprima dei primi autori.
      // Best-effort: errori non bloccano la sync.
      try {
        if (insertedNewReviews.length > 0) {
          const PLATFORM_LABEL: Record<string, string> = {
            google: "Google",
            booking: "Booking.com",
            tripadvisor: "TripAdvisor",
            expedia: "Expedia",
            vrbo: "VRBO",
            airbnb: "Airbnb",
          }
          const platformLabel = PLATFORM_LABEL[platform] ?? platform
          const count = insertedNewReviews.length

          // Media voti delle SOLE nuove recensioni con rating valorizzato.
          const rated = insertedNewReviews.filter((r) => r.rating != null)
          const avg =
            rated.length > 0 ? rated.reduce((s, r) => s + (r.rating as number), 0) / rated.length : null
          const avgPart = avg != null ? ` · media ${avg.toFixed(1)}★` : ""

          const title =
            count === 1
              ? `1 nuova recensione · ${platformLabel}${avgPart}`
              : `${count} nuove recensioni · ${platformLabel}${avgPart}`

          // Anteprima inline dei primi autori/voti (resa bene sia nel popup che
          // nell'email HTML, che non interpreta i newline).
          const PREVIEW = 5
          const previewAuthors = insertedNewReviews.slice(0, PREVIEW).map((r) => {
            const author = r.author_name?.trim() || "Ospite"
            const ratingPart = r.rating != null ? ` ${r.rating.toFixed(1)}★` : ""
            return `${author}${ratingPart}`
          })
          let body = previewAuthors.join(", ")
          if (count > PREVIEW) body += `, e altre ${count - PREVIEW}`

          // Dedup legato all'INSIEME dei review_id nuovi: rerun dello stesso set
          // (es. ETL ripetuto) NON re-invia; un set diverso genera un nuovo
          // riepilogo. Hash stabile per stare entro la dedup key.
          const idsKey = insertedNewReviews
            .map((r) => r.review_id)
            .sort()
            .join(",")
          let hash = 0
          for (let i = 0; i < idsKey.length; i++) {
            hash = (hash * 31 + idsKey.charCodeAt(i)) | 0
          }

          await notifyHotelUsersByPreference({
            hotelId,
            preferenceKey: "new_reviews",
            type: "new_reviews",
            title,
            body,
            actionUrl: "/dati/reviews",
            dedupKeyBase: `new_reviews_summary:${hotelId}:${platform}:${hash}`,
          })
        }
      } catch (notifyErr) {
        console.error("[ApifyReviewService] review summary notification failed (non-fatal):", notifyErr)
      }

      // Update last_sync timestamp for this platform
      const nowIso = new Date().toISOString()
      const syncField =
        platform === "google"
          ? "apify_last_sync_at"
          : platform === "booking"
          ? "booking_com_last_sync_at"
          : platform === "tripadvisor"
          ? "tripadvisor_last_sync_at"
          : platform === "vrbo"
          ? "vrbo_last_sync_at"
          : platform === "airbnb"
          ? "airbnb_last_sync_at"
          : "expedia_last_sync_at"

      await supabase
        .from("hotel_integrations")
        .update({ [syncField]: nowIso, updated_at: nowIso })
        .eq("hotel_id", hotelId)

      // Refresh stats snapshot (lightweight)
      await this.calculateReviewStats(hotelId)

      return {
        success: true,
        message: `${platform}: importate ${importedCount} recensioni (${newCount} nuove)`,
        reviewCount: importedCount,
        newCount,
        platform,
      }
    } catch (error) {
      console.error(`[ApifyReviewService] Error syncing ${platform}:`, error)
      return {
        success: false,
        message: error instanceof Error ? error.message : `Failed to sync ${platform}`,
        platform,
      }
    }
  }

  /**
   * Backward-compatible full sync. Calls syncSinglePlatformForHotel
   * sequentially for each configured platform. Used by the cron job.
   */
  static async syncReviewsForHotel(
    hotelId: string
  ): Promise<{ success: boolean; message: string; reviewCount?: number; newCount?: number; perPlatform?: Record<string, number> }> {
    const cfg = await this.getConfiguredPlatforms(hotelId)
    if (!cfg.success) return { success: false, message: cfg.message || "Failed to load config" }
    if (!cfg.platforms || cfg.platforms.length === 0) {
      return {
        success: false,
        message:
          "No review platforms configured. Add Google Maps Place ID, Booking.com URL, TripAdvisor URL, Expedia URL, VRBO URL or Airbnb URL in settings.",
      }
    }

    let total = 0
    let totalNew = 0
    const perPlatform: Record<string, number> = {}
    for (const p of cfg.platforms) {
      const r = await this.syncSinglePlatformForHotel(hotelId, p)
      perPlatform[p] = r.reviewCount ?? 0
      total += r.reviewCount ?? 0
      totalNew += r.newCount ?? 0
    }

    const summary = Object.entries(perPlatform)
      .filter(([_, c]) => c > 0)
      .map(([p, c]) => `${p}: ${c}`)
      .join(", ")
    return {
      success: true,
      message: `Imported ${total} reviews (${totalNew} new). ${summary || "No reviews found"}`,
      reviewCount: total,
      newCount: totalNew,
      perPlatform,
    }
  }

  /**
   * Recompute today's snapshot in `review_stats`.
   */
  private static async calculateReviewStats(hotelId: string): Promise<void> {
    const supabase = await createServiceRoleClient()

    const { data: reviews, error } = await supabase
      .from("hotel_reviews")
      .select("platform, rating")
      .eq("hotel_id", hotelId)

    if (error || !reviews) return

    const totalReviews = reviews.length
    const withRating = reviews.filter((r) => r.rating != null)
    const avgRating =
      withRating.length > 0
        ? withRating.reduce((s, r) => s + (r.rating as number), 0) / withRating.length
        : null

    const perPlatform: Record<string, { count: number; avg_rating: number | null }> = {}
    for (const r of reviews) {
      const p = (r.platform || "unknown").toLowerCase()
      if (!perPlatform[p]) perPlatform[p] = { count: 0, avg_rating: null }
      perPlatform[p].count++
    }
    for (const [p] of Object.entries(perPlatform)) {
      const platReviews = reviews.filter(
        (r) => (r.platform || "").toLowerCase() === p && r.rating != null
      )
      perPlatform[p].avg_rating =
        platReviews.length > 0
          ? Number((platReviews.reduce((s, r) => s + (r.rating as number), 0) / platReviews.length).toFixed(2))
          : null
    }

    await supabase.from("review_stats").upsert(
      {
        hotel_id: hotelId,
        snapshot_date: new Date().toISOString().split("T")[0],
        total_reviews: totalReviews,
        avg_rating: avgRating != null ? Number(avgRating.toFixed(2)) : null,
        per_platform: perPlatform,
      },
      { onConflict: "hotel_id,snapshot_date" }
    )
  }
}
