/**
 * Helpers per collegare un signup/onboarding al lead del venditore tramite
 * tracking token. Usati in 2 momenti:
 *
 *  - Subito dopo signup (`/api/auth/signup`): se l'utente arriva con un
 *    salesRefToken valido, lo lookup-iamo su sales_leads e marchiamo il
 *    lead come "registered", legandolo all'auth user appena creato. NON
 *    creiamo ancora l'associazione hotel→agent perche' a questo stadio
 *    l'hotel potrebbe non esistere ancora.
 *
 *  - Dopo creazione hotel (in onboarding action): controlliamo se l'utente
 *    ha un lead "registered" associato; in tal caso creiamo
 *    sales_agent_hotels(sales_agent_id, hotel_id) e marchiamo il lead come
 *    "converted". Se non c'e' lead, no-op.
 *
 * Tutti gli errori sono best-effort: il tracking non deve mai bloccare
 * un flusso di signup o onboarding legittimo.
 */

import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * Marca il lead come "registered" e collega l'auth user.
 * Ritorna l'agent_id se trovato, null altrimenti.
 */
export async function linkLeadToUser(args: {
  trackingToken: string
  userId: string
  email: string
}): Promise<{ leadId: string; salesAgentId: string } | null> {
  try {
    const svc = await createServiceRoleClient()
    const { data: lead } = await svc
      .from("sales_leads")
      .select("id, sales_agent_id, status, email")
      .eq("tracking_token", args.trackingToken)
      .maybeSingle()

    if (!lead) {
      console.warn("[sales/lead-tracking] token not found:", args.trackingToken.slice(0, 6))
      return null
    }

    // Se l'email del lead non matcha l'email del signup, segnaliamo ma
    // procediamo (potrebbe essere un forward dell'email tra colleghi).
    if (lead.email && lead.email.toLowerCase() !== args.email.toLowerCase()) {
      console.warn(
        `[sales/lead-tracking] email mismatch: lead.email=${lead.email} signup.email=${args.email}`,
      )
    }

    const { error: updErr } = await svc
      .from("sales_leads")
      .update({
        status: "registered",
        registered_at: new Date().toISOString(),
        signup_user_id: args.userId,
      })
      .eq("id", lead.id)

    if (updErr) {
      console.error("[sales/lead-tracking] update error:", updErr)
      return null
    }

    return { leadId: lead.id, salesAgentId: lead.sales_agent_id }
  } catch (e) {
    console.error("[sales/lead-tracking] exception:", e)
    return null
  }
}

/**
 * Da chiamare dopo creazione di un hotel: se l'utente ha un lead
 * "registered" pendente, crea l'associazione sales_agent_hotels e marca
 * il lead come "converted" col hotel_id.
 *
 * Idempotente: se l'associazione esiste gia', non duplica.
 */
export async function attachHotelToSalesAgentIfLead(args: {
  userId: string
  hotelId: string
}): Promise<{ associated: boolean; salesAgentId?: string }> {
  try {
    const svc = await createServiceRoleClient()

    const { data: lead } = await svc
      .from("sales_leads")
      .select("id, sales_agent_id, status, hotel_id")
      .eq("signup_user_id", args.userId)
      .in("status", ["registered", "clicked", "opened", "invited"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!lead) return { associated: false }

    // Default commission % dal venditore (se settata) o NULL.
    const { data: agent } = await svc
      .from("sales_agents")
      .select("default_commission_percentage")
      .eq("id", lead.sales_agent_id)
      .maybeSingle()

    // Upsert (su unique sales_agent_id+hotel_id).
    const { error: upErr } = await svc
      .from("sales_agent_hotels")
      .upsert(
        {
          sales_agent_id: lead.sales_agent_id,
          hotel_id: args.hotelId,
          lead_status: "configured",
          commission_percentage: agent?.default_commission_percentage ?? null,
          activated_at: new Date().toISOString(),
        },
        { onConflict: "sales_agent_id,hotel_id" },
      )
    if (upErr) {
      console.error("[sales/lead-tracking] sales_agent_hotels upsert error:", upErr)
      return { associated: false }
    }

    // Marca lead come converted.
    await svc
      .from("sales_leads")
      .update({
        status: "converted",
        converted_at: new Date().toISOString(),
        hotel_id: args.hotelId,
      })
      .eq("id", lead.id)

    return { associated: true, salesAgentId: lead.sales_agent_id }
  } catch (e) {
    console.error("[sales/lead-tracking] attachHotel exception:", e)
    return { associated: false }
  }
}
