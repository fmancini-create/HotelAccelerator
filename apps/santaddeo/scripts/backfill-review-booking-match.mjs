// Backfill: associa le recensioni storiche alle prenotazioni (e tipologia camera)
// in modo PRUDENTE (solo match certi). Non sovrascrive associazioni manuali.
//
// Uso:
//   set -a && source /vercel/share/.env.project && set +a
//   node scripts/backfill-review-booking-match.mjs            # tutti gli hotel
//   node scripts/backfill-review-booking-match.mjs <hotelId>  # un solo hotel
//   DRY_RUN=1 node scripts/backfill-review-booking-match.mjs  # senza scrivere

import { createClient } from "@supabase/supabase-js"

const url = process.env.SUPABASE_URL || "https://aeynirkfixurikshxfov.supabase.co"
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!key) {
  console.error("Manca SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

const ONLY_HOTEL = process.argv[2] || null
const DRY_RUN = process.env.DRY_RUN === "1"
const AUTO_MIN_SCORE = 0.6
const AUTO_MIN_MARGIN = 0.25

function normalizeName(raw) {
  if (!raw) return ""
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
function nameSimilarity(a, b) {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const ta = new Set(na.split(" ").filter((t) => t.length >= 2))
  const tb = new Set(nb.split(" ").filter((t) => t.length >= 2))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  const union = new Set([...ta, ...tb]).size
  return inter / union
}

async function run() {
  // recensioni candidate: hanno stay_date e non sono gia' associate.
  // Paginate a blocchi di 1000 (cap PostgREST).
  const reviews = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let q = sb
      .from("hotel_reviews")
      .select("id, hotel_id, author_name, stay_date")
      .not("stay_date", "is", null)
      .is("match_source", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
    if (ONLY_HOTEL) q = q.eq("hotel_id", ONLY_HOTEL)
    const { data, error } = await q
    if (error) throw error
    reviews.push(...data)
    if (!data || data.length < PAGE) break
  }
  console.log(`Recensioni da valutare: ${reviews.length}${DRY_RUN ? " (DRY RUN)" : ""}`)

  const stats = { matched: 0, no_candidates: 0, ambiguous: 0, low_score: 0 }
  // cache tipologie per hotel
  const rtCache = new Map()

  for (const r of reviews) {
    const { data: bookings } = await sb
      .from("bookings")
      .select("id, guest_name, room_type_id, check_in_date, check_out_date")
      .eq("hotel_id", r.hotel_id)
      .neq("is_cancelled", true)
      .lte("check_in_date", r.stay_date)
      .gt("check_out_date", r.stay_date)
      .limit(50)

    if (!bookings || bookings.length === 0) {
      stats.no_candidates++
      continue
    }
    const scored = bookings
      .map((b) => ({ b, score: Math.min(1, 0.4 + nameSimilarity(r.author_name, b.guest_name) * 0.6) }))
      .sort((x, y) => y.score - x.score)
    const best = scored[0]
    const second = scored[1]
    if (best.score < AUTO_MIN_SCORE) {
      stats.low_score++
      continue
    }
    if (second && best.score - second.score < AUTO_MIN_MARGIN) {
      stats.ambiguous++
      continue
    }
    stats.matched++
    if (!DRY_RUN) {
      await sb
        .from("hotel_reviews")
        .update({
          booking_id: best.b.id,
          room_type_id: best.b.room_type_id,
          match_source: "auto",
          match_confidence: Number(best.score.toFixed(2)),
          matched_at: new Date().toISOString(),
        })
        .eq("id", r.id)
        .is("match_source", null)
    }
  }

  console.log("Risultato:", JSON.stringify(stats, null, 2))
  console.log(
    `Associate: ${stats.matched} · Senza prenotazione: ${stats.no_candidates} · Ambigue: ${stats.ambiguous} · Score basso: ${stats.low_score}`,
  )
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
