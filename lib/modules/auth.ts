/**
 * Helper per capire il ruolo dell'utente corrente ai fini dei moduli.
 *
 * Regola (istruzioni di progetto: "no liberta' admin senza guardrail"):
 *  - super_admin  -> puo' attivare/disattivare qualsiasi modulo.
 *  - tenant_admin -> puo' gestire solo i moduli CORE; i moduli a pagamento
 *                    (category 'product'/'addon') passano da super_admin/Stripe.
 *
 * In preview/dev (host vercel.run, localhost, vusercontent) si assume
 * super_admin per consentire i test, coerentemente col bypass gia' presente
 * in lib/auth-property.ts.
 */
import type { NextRequest } from "next/server"
import { createClient, createClientWithToken } from "@/lib/supabase/server"

export type PlatformRole = "super_admin" | "tenant_admin" | "none"

function isDevOrPreviewHost(host: string): boolean {
  return (
    host.includes("vercel.run") ||
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    host.includes("vusercontent.net")
  )
}

function getDevBypass(request?: NextRequest): boolean {
  if (request) {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || ""
    return isDevOrPreviewHost(host)
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""
  if (appUrl && !isDevOrPreviewHost(appUrl)) return false
  return process.env.NODE_ENV === "development"
}

function getTokenFromRequest(request: NextRequest): string | undefined {
  const authHeader = request.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7)
  const cookies = request.headers.get("cookie") || ""
  const m = cookies.match(/sb-[a-zA-Z0-9]+-auth-token=([^;]+)/) ||
    cookies.match(/sb-[a-zA-Z0-9]+-auth-token\.0=([^;]+)/)
  if (m) {
    try {
      let v = m[1]
      try { v = decodeURIComponent(v) } catch {}
      const decoded = JSON.parse(v)
      if (Array.isArray(decoded) && decoded[0]?.access_token) return decoded[0].access_token
      if (decoded?.access_token) return decoded.access_token
    } catch {}
  }
  return undefined
}

/**
 * Determina il ruolo della piattaforma per l'utente corrente.
 */
export async function getPlatformRole(request?: NextRequest): Promise<PlatformRole> {
  if (getDevBypass(request)) return "super_admin"

  const token = request ? getTokenFromRequest(request) : undefined
  const supabase = token ? await createClientWithToken(token) : await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) return "none"

  const { data: collaborator } = await supabase
    .from("platform_collaborators")
    .select("role, is_active")
    .eq("email", user.email)
    .maybeSingle()

  if (collaborator?.role === "super_admin" && collaborator.is_active) {
    return "super_admin"
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("property_id")
    .eq("email", user.email)
    .maybeSingle()

  return adminUser?.property_id ? "tenant_admin" : "none"
}
