import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

const PROD_URL = "https://aeynirkfixurikshxfov.supabase.co"

function getServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY non configurata")
  return key
}

export type RevmanAccess =
  | { granted: false; response: NextResponse }
  | { granted: true; readOnly: boolean; userId: string; role: string }

/**
 * Validates RevMan access (notes/activities/files) for a given hotel.
 *
 * Access rules:
 *  - super_admin                         -> read+write
 *  - tenant linked via hotel_users       -> read+write
 *  - tenant linked via legacy org match  -> read+write
 *  - sales_agent with explicit grant in  -> read-only
 *    revman_sales_access(hotel_id, sales_agent_id)
 *  - everyone else                       -> 403
 */
export async function validateRevmanAccess(
  hotelId: string,
  preauthedUser?: { id: string } | null
): Promise<RevmanAccess> {
  const isDev = await isDevAuthAsync()
  if (isDev) {
    return { granted: true, readOnly: false, userId: "dev", role: "super_admin" }
  }

  let user = preauthedUser ?? null
  if (!user) {
    const supabase = await createClient()
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) {
      return {
        granted: false,
        response: NextResponse.json({ error: "Non autenticato" }, { status: 401 }),
      }
    }
    user = u
  }

  const headers = {
    apikey: getServiceKey(),
    Authorization: `Bearer ${getServiceKey()}`,
    "Content-Type": "application/json",
  }

  const profileRes = await fetch(
    `${PROD_URL}/rest/v1/profiles?select=role,organization_id&id=eq.${user.id}`,
    { headers, cache: "no-store" }
  )
  if (!profileRes.ok) {
    return {
      granted: false,
      response: NextResponse.json({ error: "Errore profilo" }, { status: 500 }),
    }
  }
  const [profile] = await profileRes.json()
  if (!profile) {
    return {
      granted: false,
      response: NextResponse.json({ error: "Profilo non trovato" }, { status: 403 }),
    }
  }

  // SuperAdmin: full access
  if (profile.role === "super_admin" || profile.role === "superadmin") {
    return { granted: true, readOnly: false, userId: user.id, role: profile.role }
  }

  // Sales agent: read-only se ha (a) grant esplicito su questo hotel OPPURE
  // (b) la struttura gli e' associata commercialmente (sales_agent_hotels).
  // Deve restare allineato a lib/sales/revman-access.ts (sellerHasRevmanAccess),
  // usato dalle pagine /sales/revman: altrimenti il venditore vede la pagina
  // ma le API (note/attivita'/file) rispondono 403 e lo storico appare vuoto.
  if (profile.role === "sales_agent") {
    // (a) grant esplicito (chiave sales_agent_id = profiles.id / auth user id)
    const grantRes = await fetch(
      `${PROD_URL}/rest/v1/revman_sales_access?select=id&hotel_id=eq.${hotelId}&sales_agent_id=eq.${user.id}&limit=1`,
      { headers, cache: "no-store" }
    )
    if (grantRes.ok) {
      const rows = await grantRes.json()
      if (rows?.length > 0) {
        return { granted: true, readOnly: true, userId: user.id, role: "sales_agent" }
      }
    }

    // (b) associazione commerciale: risolvi sales_agents.id da user_id e cerca
    // l'hotel in sales_agent_hotels.
    const agentRes = await fetch(
      `${PROD_URL}/rest/v1/sales_agents?select=id&user_id=eq.${user.id}`,
      { headers, cache: "no-store" }
    )
    if (agentRes.ok) {
      const agents = await agentRes.json()
      const agentIds: string[] = (agents ?? []).map((a: { id: string }) => a.id)
      if (agentIds.length > 0) {
        const assocRes = await fetch(
          `${PROD_URL}/rest/v1/sales_agent_hotels?select=id&hotel_id=eq.${hotelId}&sales_agent_id=in.(${agentIds.join(",")})&limit=1`,
          { headers, cache: "no-store" }
        )
        if (assocRes.ok) {
          const rows = await assocRes.json()
          if (rows?.length > 0) {
            return { granted: true, readOnly: true, userId: user.id, role: "sales_agent" }
          }
        }
      }
    }

    return {
      granted: false,
      response: NextResponse.json({ error: "Accesso RevMan non autorizzato" }, { status: 403 }),
    }
  }

  // Tenant via hotel_users
  const huRes = await fetch(
    `${PROD_URL}/rest/v1/hotel_users?select=id&user_id=eq.${user.id}&hotel_id=eq.${hotelId}&limit=1`,
    { headers, cache: "no-store" }
  )
  if (huRes.ok) {
    const rows = await huRes.json()
    if (rows?.length > 0) {
      return { granted: true, readOnly: false, userId: user.id, role: profile.role }
    }
  }

  // Tenant via legacy organization match
  if (profile.organization_id) {
    const orgRes = await fetch(
      `${PROD_URL}/rest/v1/hotels?select=id&id=eq.${hotelId}&organization_id=eq.${profile.organization_id}&limit=1`,
      { headers, cache: "no-store" }
    )
    if (orgRes.ok) {
      const rows = await orgRes.json()
      if (rows?.length > 0) {
        return { granted: true, readOnly: false, userId: user.id, role: profile.role }
      }
    }
  }

  return {
    granted: false,
    response: NextResponse.json(
      { error: "Accesso non autorizzato a questa struttura" },
      { status: 403 }
    ),
  }
}
