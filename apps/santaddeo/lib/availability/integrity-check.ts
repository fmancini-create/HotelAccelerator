// =============================================================================
// Guardia integrità DISPONIBILITÀ (DB vs PMS) — auto-riparante.
//
// PERCHÉ (20/07/2026): la disponibilità mostrata in dashboard/calendario legge
// `daily_availability` / `rms_availability_daily`. Questi valori sono il
// RISULTATO di un ETL a valle della sync PMS. Se l'ETL non riversa il dato
// grezzo (già fresco nel nostro DB) nelle tabelle finali, la dashboard resta
// STALE e mostra camere "libere" in realtà vendute (incidente Barronci: Suite
// e Dependance vendute mostrate libere per settimane).
//
// Questa guardia gira in un cron dedicato, NON chiama il PMS (costo zero, non
// tocca la quota BRiG/Slope): confronta il grezzo già scaricato con le tabelle
// finali. Due firme complementari:
//
//   1) SCIDOO (raw + flag processed): backlog NEAR-TERM di righe
//      `scidoo_raw_availability.processed = false` con date >= ieri. È la firma
//      esatta dell'incidente Barronci. AUTO-REPAIR: rilancia AvailabilityProcessor
//      (drain loop near-term-first) che le riversa in daily_availability.
//
//   2) TUTTI i connettori (derivati inclusi: BRiG/Slope/Bedzzle): la riga
//      NEAR-TERM di `rms_availability_daily` è ASSENTE per una tipologia attiva
//      dove invece esiste una prenotazione confermata (occupazione > 0 ma nessun
//      dato). Segnala; l'auto-repair per i derivati richiede il re-run del loro
//      processore ed è gestito dal cron chiamante.
//
// Gli alert vengono deduplicati per (kind + hotel_id) e registrati in
// `availability_integrity_alerts` (specchio di pricing_integrity_alerts).
// =============================================================================

import { createServiceRoleClient } from "@/lib/supabase/server"

export type AvailabilityAlertKind =
  | "scidoo_stale_near_term"
  | "derived_missing_near_term"
  | "scidoo_fetch_stale"

// Se il raw availability più recente di un hotel Scidoo è più vecchio di questa
// soglia, il FETCH da Scidoo sta fallendo (tipicamente 429 rate-limit non
// assorbito): la dashboard va stale senza che nessun'altra firma se ne accorga
// (un fetch fallito non crea righe non-processate). Alert-only: la riparazione
// richiede un fetch fresco da Scidoo, non gestibile da questo cron.
const SCIDOO_FETCH_STALE_HOURS = 6

export interface AvailabilityIntegrityIssue {
  kind: AvailabilityAlertKind
  hotelId: string
  hotelName: string
  severity: "critical" | "warning"
  detail: Record<string, unknown>
  dedupKey: string
}

export interface AvailabilityIntegrityResult {
  scannedHotels: number
  issues: AvailabilityIntegrityIssue[]
  repaired: Array<{ hotelId: string; kind: AvailabilityAlertKind; rowsReprocessed: number }>
}

/** yesterday in YYYY-MM-DD (margine di sicurezza sul confine di giornata). */
function yesterdayIso(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split("T")[0]
}

/** oggi in YYYY-MM-DD. */
function todayIso(): string {
  return new Date().toISOString().split("T")[0]
}

/**
 * Rileva le firme di staleness della disponibilità su tutti gli hotel con
 * integrazione PMS attiva. NON chiama il PMS: legge solo il nostro DB.
 */
export async function detectAvailabilityIssues(): Promise<AvailabilityIntegrityIssue[]> {
  const supabase = await createServiceRoleClient()
  const issues: AvailabilityIntegrityIssue[] = []
  const cutoff = yesterdayIso()

  // Hotel con integrazione PMS attiva.
  const { data: hotels, error: hotelsError } = await supabase
    .from("hotels")
    .select("id, name, pms_integrations!inner(pms_name, is_active)")
    .eq("pms_integrations.is_active", true)

  if (hotelsError) {
    console.error("[v0] [availability-integrity] errore lettura hotel:", hotelsError.message)
    return issues
  }

  for (const hotel of hotels || []) {
    const integ = Array.isArray((hotel as any).pms_integrations)
      ? (hotel as any).pms_integrations[0]
      : (hotel as any).pms_integrations
    const pmsName: string = (integ?.pms_name || "").toLowerCase()

    // ----- FIRMA 1: Scidoo raw backlog near-term -----------------------------
    if (pmsName === "scidoo") {
      // Tipologie attive mappate (solo quelle contano per la dashboard).
      const { data: roomTypes } = await supabase
        .from("room_types")
        .select("scidoo_room_type_id")
        .eq("hotel_id", hotel.id)
        .eq("is_active", true)
        .not("scidoo_room_type_id", "is", null)

      const activeIds = (roomTypes || [])
        .map((r) => r.scidoo_room_type_id)
        .filter((v): v is string => !!v)

      if (activeIds.length > 0) {
        const { count } = await supabase
          .from("scidoo_raw_availability")
          .select("*", { count: "exact", head: true })
          .eq("hotel_id", hotel.id)
          .eq("processed", false)
          .in("scidoo_room_type_id", activeIds)
          .gte("date", cutoff)

        if (count && count > 0) {
          issues.push({
            kind: "scidoo_stale_near_term",
            hotelId: hotel.id,
            hotelName: hotel.name,
            severity: "critical",
            detail: { unprocessedNearTerm: count, cutoff },
            dedupKey: `scidoo_stale_near_term:${hotel.id}`,
          })
        }

        // ----- FIRMA 3: fetch Scidoo fermo (429 non assorbito) --------------
        // Il synced_at più recente sul raw near-term ci dice quando l'ultimo
        // fetch è andato a buon fine. Se è troppo vecchio, getAvailability.php
        // sta fallendo (rate-limit) e la disponibilità va stale in silenzio.
        const { data: freshest } = await supabase
          .from("scidoo_raw_availability")
          .select("synced_at")
          .eq("hotel_id", hotel.id)
          .in("scidoo_room_type_id", activeIds)
          .gte("date", cutoff)
          .order("synced_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        const lastSync = freshest?.synced_at ? new Date(freshest.synced_at).getTime() : 0
        const ageHours = lastSync ? (Date.now() - lastSync) / 3_600_000 : Number.POSITIVE_INFINITY
        if (ageHours > SCIDOO_FETCH_STALE_HOURS) {
          issues.push({
            kind: "scidoo_fetch_stale",
            hotelId: hotel.id,
            hotelName: hotel.name,
            severity: "critical",
            detail: {
              lastSyncedAt: freshest?.synced_at ?? null,
              ageHours: Number.isFinite(ageHours) ? Math.round(ageHours * 10) / 10 : null,
              thresholdHours: SCIDOO_FETCH_STALE_HOURS,
            },
            dedupKey: `scidoo_fetch_stale:${hotel.id}`,
          })
        }
      }
    }

    // ----- FIRMA 2: derivati/tutti — riga rms mancante oggi con occupazione ---
    // Per gli hotel derivati (BRiG/Slope/Bedzzle) e anche come rete di sicurezza
    // per Scidoo: se OGGI esiste una prenotazione confermata su una tipologia
    // attiva ma NON c'è la riga corrispondente in rms_availability_daily, la
    // dashboard è cieca su quella tipologia. Firma robusta e connector-agnostica.
    const today = todayIso()
    const { data: activeRoomTypes } = await supabase
      .from("room_types")
      .select("id")
      .eq("hotel_id", hotel.id)
      .eq("is_active", true)

    const activeRoomTypeIds = (activeRoomTypes || []).map((r) => r.id)
    if (activeRoomTypeIds.length > 0) {
      const { data: rmsToday } = await supabase
        .from("rms_availability_daily")
        .select("room_type_id")
        .eq("hotel_id", hotel.id)
        .eq("date", today)
        .in("room_type_id", activeRoomTypeIds)

      const covered = new Set((rmsToday || []).map((r) => r.room_type_id))
      const missing = activeRoomTypeIds.filter((id) => !covered.has(id))

      // Segnaliamo SOLO se le tipologie scoperte hanno effettivamente una
      // prenotazione confermata oggi (altrimenti "nessuna riga" è legittimo).
      if (missing.length > 0) {
        const { data: bookedToday } = await supabase
          .from("bookings")
          .select("room_type_id")
          .eq("hotel_id", hotel.id)
          .eq("is_cancelled", false)
          .lte("check_in_date", today)
          .gt("check_out_date", today)
          .in("room_type_id", missing)

        const bookedMissing = Array.from(
          new Set((bookedToday || []).map((r) => r.room_type_id)),
        ).filter((id): id is string => !!id)

        if (bookedMissing.length > 0) {
          issues.push({
            kind: "derived_missing_near_term",
            hotelId: hotel.id,
            hotelName: hotel.name,
            severity: "critical",
            detail: { date: today, missingRoomTypeIds: bookedMissing, pmsName },
            dedupKey: `derived_missing_near_term:${hotel.id}`,
          })
        }
      }
    }
  }

  return issues
}

/**
 * Registra gli issue in availability_integrity_alerts (upsert su dedup_key).
 * Ritorna i dedupKey degli alert NUOVI (non ancora notificati) da mandare via
 * email. Gli alert risolti (non più presenti) vengono chiusi.
 */
export async function persistAvailabilityAlerts(
  issues: AvailabilityIntegrityIssue[],
): Promise<{ newDedupKeys: string[] }> {
  const supabase = await createServiceRoleClient()
  const now = new Date().toISOString()
  const activeKeys = new Set(issues.map((i) => i.dedupKey))
  const newDedupKeys: string[] = []

  // Alert aperti attualmente in tabella.
  const { data: openAlerts } = await supabase
    .from("availability_integrity_alerts")
    .select("dedup_key, notified_at, resolved_at")
    .is("resolved_at", null)

  const openByKey = new Map((openAlerts || []).map((a) => [a.dedup_key, a]))

  // Upsert degli issue attuali.
  for (const issue of issues) {
    const existing = openByKey.get(issue.dedupKey)
    if (!existing) newDedupKeys.push(issue.dedupKey) // nuovo => da notificare

    await supabase.from("availability_integrity_alerts").upsert(
      {
        kind: issue.kind,
        hotel_id: issue.hotelId,
        hotel_name: issue.hotelName,
        severity: issue.severity,
        dedup_key: issue.dedupKey,
        detail: issue.detail,
        detected_at: now,
        resolved_at: null,
        updated_at: now,
      },
      { onConflict: "dedup_key" },
    )
  }

  // Auto-risoluzione: alert aperti non più presenti fra gli issue correnti.
  const toResolve = (openAlerts || [])
    .map((a) => a.dedup_key)
    .filter((k) => !activeKeys.has(k))
  if (toResolve.length > 0) {
    await supabase
      .from("availability_integrity_alerts")
      .update({ resolved_at: now, resolved_by: "auto", updated_at: now })
      .in("dedup_key", toResolve)
      .is("resolved_at", null)
  }

  return { newDedupKeys }
}

/** Marca gli alert come notificati (dopo l'invio email). */
export async function markAvailabilityAlertsNotified(dedupKeys: string[]): Promise<void> {
  if (dedupKeys.length === 0) return
  const supabase = await createServiceRoleClient()
  await supabase
    .from("availability_integrity_alerts")
    .update({ notified_at: new Date().toISOString() })
    .in("dedup_key", dedupKeys)
    .is("notified_at", null)
}
