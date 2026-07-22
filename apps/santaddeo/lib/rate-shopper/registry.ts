import type { RateShopperProvider } from "@/lib/rate-shopper/provider"
import { ManualProvider } from "@/lib/rate-shopper/providers/manual"
import { SerpApiProvider } from "@/lib/rate-shopper/providers/serpapi"
import { ExternalProvider } from "@/lib/rate-shopper/providers/external"

const PROVIDERS: RateShopperProvider[] = [new ManualProvider(), new SerpApiProvider(), new ExternalProvider()]

export function getProvider(key: string | null | undefined): RateShopperProvider {
  const found = PROVIDERS.find((p) => p.key === key)
  return found ?? PROVIDERS[0] // default: manual
}

/**
 * Provider "pullabili" dal cron: solo quelli configurati e diversi da manual
 * (manual non ha una fonte esterna da interrogare).
 */
export function getPullableProviders(): RateShopperProvider[] {
  return PROVIDERS.filter((p) => p.key !== "manual" && p.isConfigured())
}

export function listProviders(): Array<{ key: string; configured: boolean }> {
  return PROVIDERS.map((p) => ({ key: p.key, configured: p.isConfigured() }))
}
