import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Attivazione sottoscrizione Hotel Accelerator (piano Fee).
 *
 * Logica condivisa tra:
 *  - /api/accelerator/verify-payment  (success page, percorso "felice")
 *  - /api/stripe/webhook              (fallback checkout.session.completed)
 *
 * È idempotente: se esiste già una sub attiva per l'hotel o collegata alla
 * stessa subscription Stripe, non crea duplicati. Applica inoltre i template
 * di pricing di default (bande occupazione + livelli last-minute) al primo
 * setup dell'hotel.
 */

type ActivationMetadata = {
  hotel_id?: string
  plan_type?: string
  algorithm_type?: string
  auto_pilot?: string
  pricing_config_id?: string
  fixed_fee_per_room?: string
}

export type ActivateResult =
  | { ok: true; created: boolean; subscriptionId?: string }
  | { ok: false; error: string }

export async function activateAcceleratorSubscription(
  supabase: SupabaseClient,
  params: {
    hotelId: string
    stripeSubscriptionId: string | null
    stripeCustomerId: string | null
    metadata: ActivationMetadata
  },
): Promise<ActivateResult> {
  const { hotelId, stripeSubscriptionId, stripeCustomerId, metadata } = params

  // Idempotenza: sub attiva per l'hotel OPPURE stessa subscription Stripe.
  const orFilter =
    `and(hotel_id.eq.${hotelId},is_active.eq.true)` +
    (stripeSubscriptionId ? `,stripe_subscription_id.eq.${stripeSubscriptionId}` : "")

  const { data: existingSub } = await supabase
    .from("accelerator_subscriptions")
    .select("id")
    .or(orFilter)
    .maybeSingle()

  if (existingSub) {
    return { ok: true, created: false, subscriptionId: existingSub.id }
  }

  const { data: subscription, error } = await supabase
    .from("accelerator_subscriptions")
    .insert({
      hotel_id: hotelId,
      plan_type: metadata.plan_type || "fixed_fee",
      algorithm_type: metadata.algorithm_type || "basic",
      auto_pilot: metadata.auto_pilot === "true",
      pricing_config_id: metadata.pricing_config_id || null,
      fixed_fee_per_room: metadata.fixed_fee_per_room ? Number(metadata.fixed_fee_per_room) : null,
      stripe_subscription_id: stripeSubscriptionId,
      stripe_customer_id: stripeCustomerId,
      is_active: true,
      started_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    // Conflitto sull'indice unique (race tra success page e webhook): non è
    // un errore reale, la sub è già stata creata dall'altro percorso.
    if (error.code === "23505") {
      return { ok: true, created: false }
    }
    console.error("[accelerator] Error creating subscription:", error)
    return { ok: false, error: error.message }
  }

  await applyDefaultPricingTemplates(supabase, hotelId)

  return { ok: true, created: true, subscriptionId: subscription.id }
}

async function applyDefaultPricingTemplates(supabase: SupabaseClient, hotelId: string) {
  try {
    const [existingBands, existingLm] = await Promise.all([
      supabase.from("occupancy_band_groups").select("id").eq("hotel_id", hotelId).limit(1),
      supabase.from("last_minute_levels").select("id").eq("hotel_id", hotelId).limit(1),
    ])

    const hasBands = (existingBands.data?.length || 0) > 0
    const hasLm = (existingLm.data?.length || 0) > 0

    if (hasBands && hasLm) return

    const [groupsRes, bandsRes, lmRes] = await Promise.all([
      supabase.from("default_band_group_templates").select("*").order("sort_order"),
      supabase.from("default_band_templates").select("*").order("group_id").order("band_index"),
      supabase.from("default_lm_level_templates").select("*").order("sort_order"),
    ])

    if (!hasBands && groupsRes.data && groupsRes.data.length > 0) {
      const newGroups = groupsRes.data.map((g) => ({
        hotel_id: hotelId,
        name: g.name,
        sort_order: g.sort_order,
      }))
      const { data: insertedGroups } = await supabase
        .from("occupancy_band_groups")
        .insert(newGroups)
        .select("id, name, sort_order")

      if (insertedGroups) {
        const bandInserts: Array<Record<string, unknown>> = []
        for (const ig of insertedGroups) {
          const defaultGroup = groupsRes.data.find((dg) => dg.sort_order === ig.sort_order)
          if (!defaultGroup) continue
          const defaultBands = (bandsRes.data || []).filter((b) => b.group_id === defaultGroup.id)
          for (const db of defaultBands) {
            bandInserts.push({
              hotel_id: hotelId,
              group_id: ig.id,
              band_index: db.band_index,
              min_pct: db.min_pct,
              max_pct: db.max_pct,
              increment_pct: db.increment_pct,
              label: db.label,
              occupancy_mode: "pct",
              increment_mode: "pct",
            })
          }
        }
        if (bandInserts.length > 0) {
          await supabase.from("occupancy_bands").insert(bandInserts)
        }
      }
    }

    if (!hasLm && lmRes.data && lmRes.data.length > 0) {
      const lmInserts = lmRes.data.map((l) => ({
        hotel_id: hotelId,
        name: l.name,
        sort_order: l.sort_order,
        color: l.color,
        discount_pct: l.discount_pct,
        min_occupancy_pct: l.min_occupancy_pct,
        max_occupancy_pct: l.max_occupancy_pct,
        occupancy_mode: "pct",
        min_occupancy_num: 0,
        max_occupancy_num: 0,
      }))
      await supabase.from("last_minute_levels").insert(lmInserts)
    }
  } catch (defaultsErr) {
    console.error("[accelerator] Error applying pricing defaults:", defaultsErr)
  }
}
