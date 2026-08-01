/**
 * SANTADDEO - Configurazione Ambienti
 *
 * 01/08/2026 — VALORI RIMOSSI DOPO UN AVVISO DI SICUREZZA NEON.
 *
 * Questo commento elencava le variabili d'ambiente CON I LORO VALORI, fra cui
 * una `DATABASE_URL` Neon completa (host, utente, password, database): una
 * credenziale utilizzabile cosi' com'era. Questo repository e' PUBBLICO, quindi
 * era leggibile da chiunque; Neon l'ha rilevata e ha inviato l'avviso.
 *
 * REGOLA: qui vanno solo i NOMI delle variabili, mai i valori. I valori stanno
 * nelle variabili d'ambiente del progetto (Vercel / .env.development.local) e
 * non devono mai entrare nel codice, nemmeno dentro un commento: un commento
 * finisce in git e su GitHub esattamente come il codice eseguibile.
 *
 * === PRODUZIONE (Vercel) ===
 * NEXT_PUBLIC_SUPABASE_URL
 * NEXT_PUBLIC_SUPABASE_ANON_KEY      (chiave pubblica: protetta da RLS)
 * SUPABASE_SERVICE_ROLE_KEY          (SEGRETA: scavalca la RLS)
 *
 * === SVILUPPO ===
 * NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY
 *
 * Nota: `DATABASE_URL` (Neon) non e' usata da nessun modulo di questa app —
 * Santaddeo legge un solo database, Supabase di produzione.
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
