import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * Stato dell'ultimo tentativo di pull per un provider rate-shopper.
 * La quota e' a livello ACCOUNT (es. SerpApi / Google Hotels), quindi lo stato
 * e' GLOBALE per provider (una riga per provider). Serve a mostrare nella UI la
 * VERA causa di un compset fermo (es. quota esaurita) invece del generico
 * "da configurare".
 */
export type RateShopperOutcome = "ok" | "quota_exceeded" | "no_data" | "not_configured" | "error"

export async function recordProviderOutcome(
  provider: string,
  outcome: RateShopperOutcome,
  errorMessage?: string | null,
): Promise<void> {
  try {
    const svc = await createServiceRoleClient()
    const now = new Date().toISOString()
    const row: Record<string, unknown> = {
      provider,
      last_attempt_at: now,
      last_outcome: outcome,
      last_error: errorMessage ?? null,
      updated_at: now,
    }
    if (outcome === "ok") row.last_success_at = now
    await svc.from("rate_shopper_provider_state").upsert(row, { onConflict: "provider" })
  } catch (e) {
    // Lo stato e' diagnostico: non deve mai rompere il pull.
    console.error("[v0] recordProviderOutcome error:", e)
  }
}

export interface ProviderState {
  provider: string
  last_attempt_at: string | null
  last_success_at: string | null
  last_outcome: RateShopperOutcome | null
  last_error: string | null
  updated_at: string | null
}

export async function getProviderState(provider: string): Promise<ProviderState | null> {
  try {
    const svc = await createServiceRoleClient()
    const { data } = await svc
      .from("rate_shopper_provider_state")
      .select("provider,last_attempt_at,last_success_at,last_outcome,last_error,updated_at")
      .eq("provider", provider)
      .maybeSingle()
    return (data as ProviderState) ?? null
  } catch (e) {
    console.error("[v0] getProviderState error:", e)
    return null
  }
}
