import { createServiceRoleClient } from "@/lib/supabase/direct"

/**
 * Percorso "andare online" di un hotel, calcolato dai SEGNALI REALI del
 * database (mai stimato/inventato). Approccio IBRIDO: ogni step ha uno stato
 * derivato automaticamente dai dati; il super_admin puo' inoltre forzarlo con
 * un override manuale (tabella hotel_onboarding_overrides) per i passaggi non
 * tracciabili (es. "listino inviato") o fatti fuori piattaforma.
 *
 * REGOLA DATI CERTI: gli stati "done/todo" nascono da count/flag reali. Se un
 * segnale non e' disponibile lo step resta "todo" (mai un done di comodo).
 */

export type StepStatus = "done" | "todo" | "blocked" | "skipped"

export type GoLiveStepKey =
  | "account"
  | "structure"
  | "pms_connected"
  | "first_sync"
  | "data_imported"
  | "pricing_configured"
  | "online"

export interface GoLiveStep {
  key: GoLiveStepKey
  label: string
  description: string
  /** Stato effettivo mostrato (override manuale se presente, altrimenti auto). */
  status: StepStatus
  /** Stato derivato dai soli dati reali (prima dell'override). */
  autoStatus: StepStatus
  /** True se lo stato visibile deriva da un override manuale. */
  overridden: boolean
  overrideNote?: string | null
  /** Dettaglio leggibile del segnale reale (es. "32 camere", "0 prenotazioni"). */
  detail: string
}

export interface HotelGoLive {
  hotelId: string
  hotelName: string
  organizationId: string | null
  createdAt: string
  ownerEmail: string | null
  ownerName: string | null
  steps: GoLiveStep[]
  /** Step completati / totali (escludendo gli step "skipped"). */
  completed: number
  total: number
  /** % avanzamento 0-100. */
  progress: number
  /** True se l'hotel risulta effettivamente online. */
  isOnline: boolean
  /** Numero di note manuali presenti. */
  notesCount: number
}

const STEP_DEFS: { key: GoLiveStepKey; label: string; description: string }[] = [
  { key: "account", label: "Account creato", description: "Il referente si e' registrato e ha un profilo attivo." },
  { key: "structure", label: "Struttura configurata", description: "Hotel creato con numero camere impostato." },
  { key: "pms_connected", label: "PMS collegato", description: "Connettore PMS/channel manager configurato e attivo." },
  { key: "first_sync", label: "Prima sincronizzazione", description: "Almeno una sincronizzazione dati riuscita dal PMS." },
  { key: "data_imported", label: "Dati importati", description: "Prenotazioni e/o tariffe presenti in piattaforma." },
  { key: "pricing_configured", label: "Pricing configurato", description: "Configurazione di pricing/strategia impostata." },
  { key: "online", label: "Online", description: "Hotel attivo e operativo con dati e pricing pronti." },
]

interface HotelRow {
  id: string
  name: string
  organization_id: string | null
  created_at: string
  total_rooms: number | null
  is_active: boolean | null
  pricing_config_id: string | null
}

/**
 * Calcola il percorso go-live per uno o piu' hotel. Se hotelIds e' omesso,
 * elabora tutti gli hotel non eliminati.
 */
export async function computeGoLive(hotelIds?: string[]): Promise<HotelGoLive[]> {
  const supabase = await createServiceRoleClient()

  let hotelsQuery = supabase
    .from("hotels")
    .select("id, name, organization_id, created_at, total_rooms, is_active, pricing_config_id")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (hotelIds && hotelIds.length > 0) {
    hotelsQuery = hotelsQuery.in("id", hotelIds)
  }

  const { data: hotels, error } = await hotelsQuery
  if (error) throw new Error(`hotels query failed: ${error.message}`)
  const rows = (hotels ?? []) as HotelRow[]
  if (rows.length === 0) return []

  const ids = rows.map((h) => h.id)
  const orgIds = Array.from(new Set(rows.map((h) => h.organization_id).filter(Boolean))) as string[]

  // Segnali reali, in parallelo. PostgREST e' cap a 1000 righe: usiamo head+count
  // per i conteggi cosi' restano esatti senza scaricare i dati.
  const [pmsRes, ownersRes, notesRes, overridesRes] = await Promise.all([
    supabase
      .from("pms_integrations")
      .select("hotel_id, pms_name, is_active, last_sync_at, last_sync_status")
      .in("hotel_id", ids),
    orgIds.length > 0
      ? supabase
          .from("profiles")
          .select("organization_id, email, first_name, last_name, setup_completed, created_at")
          .in("organization_id", orgIds)
      : Promise.resolve({ data: [], error: null } as const),
    supabase.from("hotel_onboarding_notes").select("hotel_id").in("hotel_id", ids),
    supabase
      .from("hotel_onboarding_overrides")
      .select("hotel_id, step_key, status, note")
      .in("hotel_id", ids),
  ])

  const pmsByHotel = new Map<string, { is_active: boolean; last_sync_at: string | null; last_sync_status: string | null; pms_name: string | null }[]>()
  for (const p of pmsRes.data ?? []) {
    const arr = pmsByHotel.get(p.hotel_id) ?? []
    arr.push(p as any)
    pmsByHotel.set(p.hotel_id, arr)
  }

  const ownerByOrg = new Map<string, { email: string | null; name: string | null; setup: boolean }>()
  for (const pr of (ownersRes.data ?? []) as any[]) {
    if (!pr.organization_id) continue
    const existing = ownerByOrg.get(pr.organization_id)
    const name = [pr.first_name, pr.last_name].filter(Boolean).join(" ").trim() || null
    // Teniamo il primo profilo con setup completato come "owner" indicativo.
    if (!existing || (!existing.setup && pr.setup_completed)) {
      ownerByOrg.set(pr.organization_id, { email: pr.email ?? null, name, setup: !!pr.setup_completed })
    }
  }

  const notesCountByHotel = new Map<string, number>()
  for (const n of (notesRes.data ?? []) as any[]) {
    notesCountByHotel.set(n.hotel_id, (notesCountByHotel.get(n.hotel_id) ?? 0) + 1)
  }

  const overridesByHotel = new Map<string, Map<string, { status: StepStatus; note: string | null }>>()
  for (const o of (overridesRes.data ?? []) as any[]) {
    const m = overridesByHotel.get(o.hotel_id) ?? new Map()
    m.set(o.step_key, { status: o.status as StepStatus, note: o.note ?? null })
    overridesByHotel.set(o.hotel_id, m)
  }

  // Conteggi bookings/rates/push prezzi per hotel (esatti, head+count per hotel).
  const bookingsCount = await countByHotel(supabase, "bookings", ids)
  const ratesCount = await countByHotel(supabase, "rates", ids)
  const pushCount = await countByHotel(supabase, "price_change_log", ids)

  return rows.map((h) => {
    const owner = h.organization_id ? ownerByOrg.get(h.organization_id) : undefined
    const pmsList = pmsByHotel.get(h.id) ?? []
    const activePms = pmsList.find((p) => p.is_active)
    const syncedPms = pmsList.find((p) => p.last_sync_at)
    const nBookings = bookingsCount.get(h.id) ?? 0
    const nRates = ratesCount.get(h.id) ?? 0
    const nPush = pushCount.get(h.id) ?? 0

    // Stato AUTO per ogni step, dai segnali reali.
    const auto: Record<GoLiveStepKey, { status: StepStatus; detail: string }> = {
      account: {
        status: owner ? "done" : "todo",
        detail: owner ? `Referente: ${owner.name || owner.email || "n/d"}` : "Nessun profilo collegato",
      },
      structure: {
        status: h.total_rooms && h.total_rooms > 0 ? "done" : "todo",
        detail: h.total_rooms && h.total_rooms > 0 ? `${h.total_rooms} camere` : "Camere non impostate",
      },
      pms_connected: {
        status: activePms ? "done" : "todo",
        detail: activePms
          ? `${activePms.pms_name ?? "PMS"} attivo`
          : pmsList.length > 0
            ? `${pmsList[0].pms_name ?? "PMS"} configurato ma non attivo`
            : "Nessun connettore",
      },
      first_sync: {
        status: syncedPms ? "done" : "todo",
        detail: syncedPms?.last_sync_at
          ? `Ultima sync: ${new Date(syncedPms.last_sync_at).toLocaleString("it-IT")}`
          : "Mai sincronizzato",
      },
      data_imported: {
        status: nBookings > 0 || nRates > 0 ? "done" : "todo",
        detail: `${nBookings} prenotazioni · ${nRates} tariffe`,
      },
      pricing_configured: {
        status: h.pricing_config_id || nPush > 0 ? "done" : "todo",
        detail: h.pricing_config_id
          ? "Configurazione pricing presente"
          : nPush > 0
            ? `${nPush} invii prezzi`
            : "Pricing non configurato",
      },
      online: {
        // Online = struttura + PMS attivo + sync + (dati o pricing) + hotel attivo.
        status:
          !!h.is_active && !!activePms && !!syncedPms && (nBookings > 0 || nRates > 0)
            ? "done"
            : "todo",
        detail: h.is_active ? "Hotel attivo" : "Hotel non attivo",
      },
    }

    const overrides = overridesByHotel.get(h.id)
    const steps: GoLiveStep[] = STEP_DEFS.map((def) => {
      const a = auto[def.key]
      const ov = overrides?.get(def.key)
      return {
        key: def.key,
        label: def.label,
        description: def.description,
        autoStatus: a.status,
        status: ov ? ov.status : a.status,
        overridden: !!ov,
        overrideNote: ov?.note ?? null,
        detail: a.detail,
      }
    })

    const counted = steps.filter((s) => s.status !== "skipped")
    const completed = counted.filter((s) => s.status === "done").length
    const total = counted.length
    const onlineStep = steps.find((s) => s.key === "online")!

    return {
      hotelId: h.id,
      hotelName: h.name,
      organizationId: h.organization_id,
      createdAt: h.created_at,
      ownerEmail: owner?.email ?? null,
      ownerName: owner?.name ?? null,
      steps,
      completed,
      total,
      progress: total > 0 ? Math.round((completed / total) * 100) : 0,
      isOnline: onlineStep.status === "done",
      notesCount: notesCountByHotel.get(h.id) ?? 0,
    }
  })
}

/** Conteggi esatti per hotel usando count exact + head (no payload). */
async function countByHotel(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  table: string,
  hotelIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  // Una query per hotel mantiene i conteggi esatti aggirando il cap di 1000
  // righe di PostgREST. Gli hotel sono pochi (decine), quindi e' accettabile.
  await Promise.all(
    hotelIds.map(async (id) => {
      const { count } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("hotel_id", id)
      result.set(id, count ?? 0)
    }),
  )
  return result
}

export const GO_LIVE_STEP_KEYS: GoLiveStepKey[] = STEP_DEFS.map((s) => s.key)
