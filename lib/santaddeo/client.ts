import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Client read-only verso il DB Santaddeo (RMS).
 *
 * REGOLE (vedi docs/SUITE_ROADMAP.md):
 * - Server-only: la service-role key non deve MAI raggiungere il client.
 * - Null-safe: se le env non sono configurate ritorna null e il chiamante
 *   deve degradare a stato "not_configured" (mai errori, mai dati finti).
 * - Ogni query eseguita con questo client DEVE filtrare esplicitamente per
 *   hotel_id = properties.santaddeo_hotel_id (scoping obbligatorio: il
 *   service-role bypassa la RLS di Santaddeo).
 * - SOLO letture. Nessuna scrittura sul DB Santaddeo da questo progetto.
 */
export function getSantaddeoClient(): SupabaseClient | null {
  const url = process.env.SANTADDEO_SUPABASE_URL
  const key = process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return null
  }

  // Hardening: se l'URL non è valido (env vuota/placeholder/malformata),
  // degrada a null → "not_configured", invece di far esplodere la route.
  try {
    new URL(url)
  } catch {
    return null
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export function isSantaddeoConfigured(): boolean {
  return Boolean(process.env.SANTADDEO_SUPABASE_URL && process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY)
}
