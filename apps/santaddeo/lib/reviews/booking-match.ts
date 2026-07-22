import { createServiceRoleClient } from "@/lib/supabase/server"

// ---------------------------------------------------------------------------
// Associazione recensione -> prenotazione -> tipologia camera
//
// Strategia PRUDENTE: associamo in automatico solo quando esiste UNA sola
// prenotazione plausibile per la recensione. In tutti gli altri casi la
// recensione resta "da associare" e sara' il tenant a sceglierla a mano dal
// menu a tendina. Non inventiamo mai un abbinamento incerto (regola dati certi).
// ---------------------------------------------------------------------------

export type BookingCandidate = {
  id: string
  guestName: string | null
  checkInDate: string | null
  checkOutDate: string | null
  roomTypeId: string | null
  roomTypeName: string | null
  // punteggio 0..1 di quanto la prenotazione combacia con la recensione
  score: number
}

// Normalizza un nome per il confronto: minuscolo, senza accenti, senza
// punteggiatura, spazi compattati.
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return ""
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // rimuove i diacritici
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// Similarita' fra due nomi basata sui token condivisi (Jaccard sui token).
// Robusta a ordine diverso (es. "Mario Rossi" vs "Rossi Mario") e a nomi
// parziali tipici delle OTA (es. "Mario R.").
export function nameSimilarity(a: string | null, b: string | null): number {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const ta = new Set(na.split(" ").filter((t) => t.length >= 2))
  const tb = new Set(nb.split(" ").filter((t) => t.length >= 2))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  // Se almeno un token "forte" combacia diamo comunque un minimo segnale.
  const union = new Set([...ta, ...tb]).size
  return inter / union
}

// Soglie di certezza per l'auto-match.
const AUTO_MIN_SCORE = 0.6 // il candidato migliore deve superare questa soglia
const AUTO_MIN_MARGIN = 0.25 // e distanziare il secondo classificato di almeno tanto

export type ReviewForMatch = {
  id: string
  hotel_id: string
  author_name: string | null
  stay_date: string | null
}

// Trova le prenotazioni candidate per una recensione, ordinate per score.
// Il filtro principale e' la finestra di soggiorno: la stay_date deve cadere
// tra check_in_date (incluso) e check_out_date (escluso). Se manca la
// stay_date non possiamo restringere e ritorniamo lista vuota per l'auto-match
// (il tenant potra' comunque cercare a mano via API candidates).
export async function findBookingCandidates(
  review: ReviewForMatch,
  opts: { requireStayDate?: boolean } = {},
): Promise<BookingCandidate[]> {
  const supabase = await createServiceRoleClient()
  if (opts.requireStayDate && !review.stay_date) return []

  let query = supabase
    .from("bookings")
    .select("id, guest_name, check_in_date, check_out_date, room_type_id, is_cancelled")
    .eq("hotel_id", review.hotel_id)
    .neq("is_cancelled", true)
    .limit(50)

  if (review.stay_date) {
    // soggiorno che copre la notte stay_date: check_in <= stay_date < check_out
    query = query.lte("check_in_date", review.stay_date).gt("check_out_date", review.stay_date)
  } else {
    // senza data non restringiamo per finestra: ci affidiamo al solo nome,
    // utile per la ricerca manuale. Limitiamo alle piu' recenti.
    query = query.order("check_out_date", { ascending: false })
  }

  const { data: bookings, error } = await query
  if (error || !bookings) return []

  // Raccogli i nomi delle tipologie in un colpo solo.
  const roomTypeIds = [...new Set(bookings.map((b) => b.room_type_id).filter(Boolean))] as string[]
  const roomTypeNames = new Map<string, string>()
  if (roomTypeIds.length > 0) {
    const { data: rts } = await supabase.from("room_types").select("id, name").in("id", roomTypeIds)
    for (const rt of rts ?? []) roomTypeNames.set(rt.id, rt.name)
  }

  const candidates: BookingCandidate[] = bookings.map((b) => {
    const sim = nameSimilarity(review.author_name, b.guest_name)
    // Se la finestra combacia (stay_date presente) diamo un bonus di base,
    // perche' il vincolo temporale e' gia' un segnale forte.
    const windowBonus = review.stay_date ? 0.4 : 0
    const score = Math.min(1, windowBonus + sim * 0.6)
    return {
      id: b.id,
      guestName: b.guest_name,
      checkInDate: b.check_in_date,
      checkOutDate: b.check_out_date,
      roomTypeId: b.room_type_id,
      roomTypeName: b.room_type_id ? roomTypeNames.get(b.room_type_id) ?? null : null,
      score,
    }
  })

  candidates.sort((a, b) => b.score - a.score)
  return candidates
}

// Ricerca candidati per il dropdown manuale: parte dalla finestra di soggiorno
// (se presente) e, se l'utente digita un testo, cerca anche per nome ospite a
// prescindere dalle date. Pensata per popolare il menu a tendina nella UI.
export async function searchBookingCandidates(
  hotelId: string,
  opts: { stayDate?: string | null; authorName?: string | null; search?: string | null; limit?: number },
): Promise<BookingCandidate[]> {
  const supabase = await createServiceRoleClient()
  const limit = opts.limit ?? 25
  const search = (opts.search ?? "").trim()

  let query = supabase
    .from("bookings")
    .select("id, guest_name, check_in_date, check_out_date, room_type_id, is_cancelled")
    .eq("hotel_id", hotelId)
    .neq("is_cancelled", true)
    .limit(limit)

  if (search) {
    // ricerca esplicita per nome: ignora la finestra di soggiorno
    query = query.ilike("guest_name", `%${search}%`).order("check_out_date", { ascending: false })
  } else if (opts.stayDate) {
    query = query.lte("check_in_date", opts.stayDate).gt("check_out_date", opts.stayDate)
  } else {
    query = query.order("check_out_date", { ascending: false })
  }

  const { data: bookings, error } = await query
  if (error || !bookings) return []

  const roomTypeIds = [...new Set(bookings.map((b) => b.room_type_id).filter(Boolean))] as string[]
  const roomTypeNames = new Map<string, string>()
  if (roomTypeIds.length > 0) {
    const { data: rts } = await supabase.from("room_types").select("id, name").in("id", roomTypeIds)
    for (const rt of rts ?? []) roomTypeNames.set(rt.id, rt.name)
  }

  const candidates: BookingCandidate[] = bookings.map((b) => {
    const sim = nameSimilarity(opts.authorName ?? null, b.guest_name)
    const windowBonus = !search && opts.stayDate ? 0.4 : 0
    const score = Math.min(1, windowBonus + sim * 0.6)
    return {
      id: b.id,
      guestName: b.guest_name,
      checkInDate: b.check_in_date,
      checkOutDate: b.check_out_date,
      roomTypeId: b.room_type_id,
      roomTypeName: b.room_type_id ? roomTypeNames.get(b.room_type_id) ?? null : null,
      score,
    }
  })
  candidates.sort((a, b) => b.score - a.score)
  return candidates
}

export type AutoMatchResult =
  | { matched: true; bookingId: string; roomTypeId: string | null; confidence: number }
  | { matched: false; reason: "no_stay_date" | "no_candidates" | "ambiguous" | "low_score" }

// Decide se associare in automatico, in modo prudente.
export function decideAutoMatch(candidates: BookingCandidate[], hasStayDate: boolean): AutoMatchResult {
  if (!hasStayDate) return { matched: false, reason: "no_stay_date" }
  if (candidates.length === 0) return { matched: false, reason: "no_candidates" }
  const best = candidates[0]
  const second = candidates[1]
  if (best.score < AUTO_MIN_SCORE) return { matched: false, reason: "low_score" }
  // Deve esserci un solo candidato chiaramente migliore.
  if (second && best.score - second.score < AUTO_MIN_MARGIN) {
    return { matched: false, reason: "ambiguous" }
  }
  return { matched: true, bookingId: best.id, roomTypeId: best.roomTypeId, confidence: Number(best.score.toFixed(2)) }
}

// Esegue l'auto-match per una singola recensione e, se certo, la aggiorna.
// Non sovrascrive MAI un'associazione manuale gia' presente.
export async function autoMatchReview(review: ReviewForMatch): Promise<AutoMatchResult> {
  const candidates = await findBookingCandidates(review, { requireStayDate: true })
  const decision = decideAutoMatch(candidates, !!review.stay_date)
  if (!decision.matched) return decision

  const supabase = await createServiceRoleClient()
  const { error } = await supabase
    .from("hotel_reviews")
    .update({
      booking_id: decision.bookingId,
      room_type_id: decision.roomTypeId,
      match_source: "auto",
      match_confidence: decision.confidence,
      matched_at: new Date().toISOString(),
    })
    .eq("id", review.id)
    .is("match_source", null) // non tocca le associazioni manuali o gia' fatte

  if (error) return { matched: false, reason: "low_score" }
  return decision
}
