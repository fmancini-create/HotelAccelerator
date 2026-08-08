/** Single source of truth for Santaddeo Supabase configuration. */

function required(value: string | undefined, names: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`Configurazione Supabase mancante: ${names}`)
  return normalized
}

export function getSupabaseUrl(): string {
  return required(
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SANTADDEO_SUPABASE_URL,
    "NEXT_PUBLIC_SUPABASE_URL",
  )
}

export function getSupabasePublishableKey(): string {
  return required(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY,
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (o NEXT_PUBLIC_SUPABASE_ANON_KEY legacy)",
  )
}

export function getSupabaseSecretKey(): string {
  return required(
    process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY legacy)",
  )
}

export function getPublicSupabaseConfig(): {
  url: string
  publishableKey: string
  anonKey: string
} {
  const publishableKey = getSupabasePublishableKey()
  return { url: getSupabaseUrl(), publishableKey, anonKey: publishableKey }
}
