import type { createServiceRoleClient } from "@/lib/supabase/server"

type SvcClient = Awaited<ReturnType<typeof createServiceRoleClient>>

/**
 * ATTIVAZIONE DELLA DOMANDA DIRETTA NEL MOTORE PREZZI (addon Traffico web)
 * ----------------------------------------------------------------------
 * 14/06/2026. Collega il segnale `k_direct_demand` (visite al sito) al motore
 * prezzi SENZA toccare il motore puro (`calculate-suggested-price.ts`).
 *
 * Come funziona il gate (vedi calculateK):
 *  - La variabile `k_direct_demand` e' registrata in pricing_variables con
 *    is_active=true ma default_weight=0 -> per OGNI hotel il motore la salta
 *    (weight<=0 -> continue). Impatto ZERO di default.
 *  - L'attivazione PER-HOTEL avviene creando una riga in
 *    `pricing_variable_weight_overrides` con weight>0 e un intervallo di date
 *    ampio: solo per quell'hotel, e solo sulle date coperte, la variabile
 *    contribuisce. Nessun altro hotel viene toccato.
 *
 * Modalita' scelta dal tenant:
 *  - "now": override attivo subito.
 *  - "after_10_days": l'override viene creato solo quando ci sono almeno 10
 *    giorni distinti di dati visite (segnale affidabile). Fino ad allora lo
 *    stato resta "pending".
 */

const VARIABLE_KEY = "k_direct_demand"
const ACTIVATION_DATA_DAYS = 10
const OVERRIDE_LABEL = "Domanda diretta (Traffico web)"
const OVERRIDE_DATE_FROM = "2020-01-01"
const OVERRIDE_DATE_TO = "2999-12-31"

export interface WebTrafficPricingStatus {
  mode: "now" | "after_10_days"
  status: "off" | "pending" | "active"
  weight: number
  dataDays: number
  daysNeeded: number
  activatedAt: string | null
}

/** Id della riga pricing_variables per k_direct_demand (o null se assente). */
async function getVariableId(svc: SvcClient): Promise<string | null> {
  const { data } = await svc
    .from("pricing_variables")
    .select("id")
    .eq("variable_key", VARIABLE_KEY)
    .maybeSingle()
  return data?.id ?? null
}

/** Numero di giorni distinti con dati visite per l'hotel. */
export async function countDataDays(svc: SvcClient, hotelId: string): Promise<number> {
  const { data } = await svc
    .from("site_visit_daily")
    .select("day")
    .eq("hotel_id", hotelId)
  return new Set((data || []).map((r: any) => r.day)).size
}

/** Crea/attiva l'override di peso per-hotel (idempotente). */
async function enableOverride(
  svc: SvcClient,
  hotelId: string,
  weight: number,
): Promise<string | null> {
  const variableId = await getVariableId(svc)
  if (!variableId) {
    console.error("[web-traffic][pricing] variabile k_direct_demand assente in pricing_variables")
    return null
  }

  // Esiste gia' un override per questo hotel+variabile? Riusalo (idempotente).
  const { data: existing } = await svc
    .from("pricing_variable_weight_overrides")
    .select("id")
    .eq("hotel_id", hotelId)
    .eq("variable_id", variableId)
    .eq("label", OVERRIDE_LABEL)
    .maybeSingle()

  if (existing?.id) {
    await svc
      .from("pricing_variable_weight_overrides")
      .update({ weight, is_active: true, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
    return existing.id
  }

  const { data: inserted, error } = await svc
    .from("pricing_variable_weight_overrides")
    .insert({
      hotel_id: hotelId,
      variable_id: variableId,
      label: OVERRIDE_LABEL,
      date_from: OVERRIDE_DATE_FROM,
      date_to: OVERRIDE_DATE_TO,
      days_of_week: null,
      weight,
      priority: 5,
      is_active: true,
    })
    .select("id")
    .single()

  if (error) {
    console.error("[web-traffic][pricing] insert override fallita:", error.message)
    return null
  }
  return inserted.id
}

/** Disattiva l'override (la variabile torna inerte per l'hotel). */
async function disableOverride(svc: SvcClient, hotelId: string): Promise<void> {
  const variableId = await getVariableId(svc)
  if (!variableId) return
  await svc
    .from("pricing_variable_weight_overrides")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("hotel_id", hotelId)
    .eq("variable_id", variableId)
    .eq("label", OVERRIDE_LABEL)
}

/** Stato corrente per la UI. */
export async function getPricingStatus(
  svc: SvcClient,
  hotelId: string,
): Promise<WebTrafficPricingStatus> {
  const { data: cfg } = await svc
    .from("web_traffic_pricing_config")
    .select("mode, status, weight, activated_at")
    .eq("hotel_id", hotelId)
    .maybeSingle()

  const dataDays = await countDataDays(svc, hotelId)

  return {
    mode: cfg?.mode ?? "after_10_days",
    status: cfg?.status ?? "off",
    weight: cfg?.weight ?? 4,
    dataDays,
    daysNeeded: ACTIVATION_DATA_DAYS,
    activatedAt: cfg?.activated_at ?? null,
  }
}

/**
 * Imposta la modalita' scelta dal tenant e applica l'effetto immediato.
 * - mode "now": attiva subito l'override.
 * - mode "after_10_days": attiva se ci sono gia' >=10 giorni di dati,
 *   altrimenti resta in "pending" (l'attivazione avverra' via maybeActivatePending).
 */
export async function setPricingMode(
  svc: SvcClient,
  hotelId: string,
  mode: "now" | "after_10_days",
  weight = 4,
): Promise<WebTrafficPricingStatus> {
  const dataDays = await countDataDays(svc, hotelId)
  const shouldActivate = mode === "now" || dataDays >= ACTIVATION_DATA_DAYS

  let status: "pending" | "active" = "pending"
  let activatedAt: string | null = null
  if (shouldActivate) {
    const overrideId = await enableOverride(svc, hotelId, weight)
    if (overrideId) {
      status = "active"
      activatedAt = new Date().toISOString()
      await svc
        .from("web_traffic_pricing_config")
        .upsert(
          {
            hotel_id: hotelId,
            mode,
            status,
            weight,
            override_id: overrideId,
            activated_at: activatedAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "hotel_id" },
        )
      return getPricingStatus(svc, hotelId)
    }
  }

  // Pending (o attivazione fallita): salva intento, override non attivo.
  await svc
    .from("web_traffic_pricing_config")
    .upsert(
      {
        hotel_id: hotelId,
        mode,
        status,
        weight,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "hotel_id" },
    )
  return getPricingStatus(svc, hotelId)
}

/** Spegne completamente l'effetto sul pricing (l'addon resta attivo). */
export async function turnOffPricing(svc: SvcClient, hotelId: string): Promise<void> {
  await disableOverride(svc, hotelId)
  await svc
    .from("web_traffic_pricing_config")
    .upsert(
      { hotel_id: hotelId, status: "off", updated_at: new Date().toISOString() },
      { onConflict: "hotel_id" },
    )
}

/**
 * Attivazione differita: chiamata dal cron K-values per ogni hotel processato.
 * Se l'hotel ha scelto "after_10_days", e' ancora "pending", ha l'addon attivo
 * e ha raggiunto i 10 giorni di dati -> crea l'override e passa a "active".
 * Idempotente e silenziosa: non lancia mai (non deve rompere il cron).
 */
export async function maybeActivatePending(svc: SvcClient, hotelId: string): Promise<void> {
  try {
    const { data: cfg } = await svc
      .from("web_traffic_pricing_config")
      .select("mode, status, weight")
      .eq("hotel_id", hotelId)
      .maybeSingle()
    if (!cfg || cfg.status !== "pending" || cfg.mode !== "after_10_days") return

    // L'addon deve essere attivo.
    const { data: sub } = await svc
      .from("addon_subscriptions")
      .select("status")
      .eq("hotel_id", hotelId)
      .eq("addon_type", "web_traffic")
      .limit(1)
    const s = sub?.[0]?.status
    if (s !== "active" && s !== "trialing") return

    const dataDays = await countDataDays(svc, hotelId)
    if (dataDays < ACTIVATION_DATA_DAYS) return

    const overrideId = await enableOverride(svc, hotelId, cfg.weight ?? 4)
    if (!overrideId) return
    await svc
      .from("web_traffic_pricing_config")
      .update({
        status: "active",
        override_id: overrideId,
        activated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("hotel_id", hotelId)
    console.log(`[web-traffic][pricing] attivazione differita completata hotel=${hotelId} (${dataDays} giorni dati)`)
  } catch (e) {
    console.error("[web-traffic][pricing] maybeActivatePending error:", e)
  }
}
