/**
 * SANTADDEO - Configurazione Ambienti
 *
 * PRODUZIONE: Supabase (aeynirkfixurikshxfov.supabase.co)
 * SVILUPPO: Neon per DB + Supabase per Auth
 * BACKUP: Supabase personale (dshdmkmhhbjractpvojp.supabase.co)
 *
 * Le variabili d'ambiente da impostare:
 *
 * === PRODUZIONE (Vercel) ===
 * NEXT_PUBLIC_SUPABASE_URL=https://aeynirkfixurikshxfov.supabase.co
 * NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...NhCFYvT7fvsuEwvhP7em7vDKifRa6RmnfdVYwUvKWp0
 * SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...ikeYL6vWDIBqimfIbISke15Gc1PQ8W3VpmrGDgKrUP0
 *
 * === SVILUPPO (v0/localhost) ===
 * DATABASE_URL=postgresql://neondb_owner:npg_0EimLhr5xRKb@ep-shiny-mud-ahqt79y0-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require
 * NEXT_PUBLIC_SUPABASE_URL=https://aeynirkfixurikshxfov.supabase.co
 * NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...NhCFYvT7fvsuEwvhP7em7vDKifRa6RmnfdVYwUvKWp0
 * SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...ikeYL6vWDIBqimfIbISke15Gc1PQ8W3VpmrGDgKrUP0
 *
 * === BACKUP (opzionale) ===
 * BACKUP_SUPABASE_URL=https://dshdmkmhhbjractpvojp.supabase.co
 * BACKUP_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...AGhJ7XELzaR8sHOM5OAMEjKSe-GCfJ6t83m6G2v_vF4
 */

export type Environment = "development" | "production" | "backup"

export interface EnvironmentConfig {
  name: Environment
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceRoleKey?: string
  databaseUrl?: string // Per Neon in sviluppo
}

/**
 * Determina l'ambiente corrente
 */
export function getCurrentEnvironment(): Environment {
  // Se NODE_ENV è production, siamo in produzione
  if (process.env.NODE_ENV === "production") {
    return "production"
  }
  return "development"
}

/**
 * Ottiene la configurazione per l'ambiente corrente
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  const env = getCurrentEnvironment()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SANTADDEO_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SANTADDEO_SUPABASE_ANON_KEY
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY
  const databaseUrl = process.env.DATABASE_URL

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[SANTADDEO] Variabili Supabase mancanti:", {
      hasUrl: !!supabaseUrl,
      hasAnonKey: !!supabaseAnonKey,
      env,
    })
    throw new Error("Variabili Supabase mancanti. Imposta NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }

  return {
    name: env,
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
    databaseUrl,
  }
}

/**
 * Ottiene la configurazione per il backup (Supabase personale)
 */
export function getBackupConfig(): EnvironmentConfig | null {
  const backupUrl = process.env.BACKUP_SUPABASE_URL
  const backupServiceRoleKey = process.env.BACKUP_SUPABASE_SERVICE_ROLE_KEY

  if (!backupUrl || !backupServiceRoleKey) {
    return null
  }

  return {
    name: "backup",
    supabaseUrl: backupUrl,
    supabaseAnonKey: "", // Non usato per backup
    supabaseServiceRoleKey: backupServiceRoleKey,
  }
}

/**
 * Verifica che tutte le variabili d'ambiente richieste siano presenti
 */
export function validateEnvironment(): { valid: boolean; missing: string[] } {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]

  const missing = required.filter((key) => !process.env[key])

  return {
    valid: missing.length === 0,
    missing,
  }
}
