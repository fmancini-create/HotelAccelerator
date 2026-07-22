/**
 * Helper centralizzato per gli endpoint /api/superadmin/sales/*.
 * Verifica che l'utente autenticato sia super_admin. Restituisce user o
 * NextResponse di errore.
 */

import { NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export async function requireSuperadmin() {
  const { user, supabase } = await getAuthUserOrDev()
  if (!user) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "super_admin") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }

  return { user, profile }
}
