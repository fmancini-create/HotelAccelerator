import { createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import type { AddonId } from "@/lib/products"

const PROD_URL = "https://aeynirkfixurikshxfov.supabase.co"

function serviceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY non configurata")
  return key
}

/** True se l'utente indicato e' super_admin (ruolo su profiles). */
async function isSuperAdmin(userId?: string | null): Promise<boolean> {
  if (!userId) return false
  try {
    const res = await fetch(`${PROD_URL}/rest/v1/profiles?select=role&id=eq.${userId}`, {
      headers: {
        apikey: serviceKey(),
        Authorization: `Bearer ${serviceKey()}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })
    if (res.ok) {
      const rows = await res.json()
      const role = rows?.[0]?.role
      return role === "super_admin" || role === "superadmin"
    }
  } catch (e) {
    console.error("[hasAddon] superadmin check failed:", e)
  }
  return false
}

/**
 * Verifica se un addon (es. "booking_pace", "rate_shopper") e' accessibile per
 * la struttura indicata.
 *
 * Accesso concesso se:
 * - preview/dev (isDevAuthAsync) -> sempre, per esplorare la UI in anteprima;
 * - l'utente loggato e' super_admin -> sempre, senza richiedere subscription
 *   (cosi' lo staff 4BID puo' provare i moduli sbloccati);
 * - altrimenti riga in addon_subscriptions con status 'active'/'trialing'.
 *
 * Letture via service role per evitare problemi di RLS. Il controllo di
 * appartenenza dell'utente alla struttura va fatto a parte con
 * validateHotelAccess (che gia' concede i super_admin).
 */
export async function hasAddon(hotelId: string, addonType: AddonId): Promise<boolean> {
  if (!hotelId) return false

  // Preview/dev: accesso aperto.
  if (await isDevAuthAsync()) return true

  // Super admin: moduli sbloccati senza subscription.
  try {
    const { user } = await getAuthUserOrDev()
    if (await isSuperAdmin(user?.id)) return true
  } catch (e) {
    console.error("[hasAddon] user resolve failed:", e)
  }

  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase
    .from("addon_subscriptions")
    .select("status")
    .eq("hotel_id", hotelId)
    .eq("addon_type", addonType)
    .limit(1)

  if (error) {
    console.error("[hasAddon] error:", error.message)
    return false
  }

  const status = data?.[0]?.status
  return status === "active" || status === "trialing"
}

/**
 * Compat: in passato la logica super_admin era qui. Ora vive dentro hasAddon,
 * quindi questa variante si limita a delegare (il parametro userId resta per
 * retro-compatibilita' delle firme esistenti).
 */
export async function hasAddonOrSuperAdmin(
  hotelId: string,
  addonType: AddonId,
  _userId?: string | null,
): Promise<boolean> {
  return hasAddon(hotelId, addonType)
}
