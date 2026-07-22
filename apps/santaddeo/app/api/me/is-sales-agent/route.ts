import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { resolveLanding } from "@/lib/auth/resolve-landing"

export const dynamic = "force-dynamic"

/**
 * Ritorna se l'utente loggato e' anche un sales_agent attivo.
 *
 * Usato dall'AppHeader per mostrare il link "Area venditori" agli utenti
 * con doppio ruolo (es. property_admin che ha anche una riga in
 * sales_agents perche' segnala lead). Vedi memoria 03/05/2026 — strategia
 * "role primario property_admin + flag agente".
 *
 * Risposta: { isSalesAgent: boolean, isPureSalesAgent: boolean }
 *  - isSalesAgent: true se l'utente e' un venditore (riga sales_agents attiva
 *    OPPURE profiles.role === 'sales_agent')
 *  - isPureSalesAgent: true SOLO se e' venditore E NON ha alcun accesso
 *    struttura (nessuna riga user_property_map, nessun ruolo tenant, nessuna
 *    organizzazione). Un venditore CON accesso struttura (dual-role) NON e'
 *    "puro": deve poter passare da una parte all'altra, quindi qui torniamo
 *    false e l'AppHeader mostra il link "Area venditori".
 */
export async function GET() {
  const { user } = await getAuthUserOrDev()
  if (!user) {
    return NextResponse.json(
      { isSalesAgent: false, isPureSalesAgent: false },
      { status: 200 },
    )
  }

  const svc = await createServiceRoleClient()

  // resolveLanding e' la sorgente di verita' condivisa: calcola isSalesAgent +
  // hasTenantAccess leggendo profiles + sales_agents + user_property_map +
  // organization_id. "Puro" = venditore senza alcun accesso struttura.
  const { isSalesAgent, hasTenantAccess } = await resolveLanding(svc, user.id)
  const isPureSalesAgent = isSalesAgent && !hasTenantAccess

  return NextResponse.json({ isSalesAgent, isPureSalesAgent })
}
