import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

/**
 * Restituisce `null` se l'utente e' super_admin (o siamo in DEV preview),
 * altrimenti restituisce una NextResponse 401/403 da rimandare al client.
 *
 * Uso:
 *   const denied = await requireSuperAdmin()
 *   if (denied) return denied
 *   // ... continua con la logica admin
 *
 * Pattern in linea con `validateHotelAccess` per coerenza.
 *
 * IMPORTANTE: gli endpoint admin "una sola volta" (bootstrap, setup-users,
 * sync-prod-to-dev, etc.) erano tutti pubblici prima di questo helper. Ogni
 * route che (a) accede al service role, (b) modifica schema, (c) sincronizza
 * dati cross-database, (d) espone PII di altri utenti, DEVE chiamarlo.
 */
export async function requireSuperAdmin(): Promise<NextResponse | null> {
  // DEV/preview bypass: chi sta lavorando localmente o nel preview sandbox
  // non deve fare login per testare gli endpoint admin.
  const isDev = await isDevAuthAsync()
  if (isDev) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  // Accettiamo entrambi gli alias: "super_admin" e' il canonico, "superadmin"
  // sopravvive in alcuni record legacy.
  const isSuperAdmin =
    profile?.role === "super_admin" || profile?.role === "superadmin"

  if (!isSuperAdmin) {
    return NextResponse.json(
      { error: "Solo super_admin puo' accedere a questo endpoint" },
      { status: 403 },
    )
  }

  return null
}
