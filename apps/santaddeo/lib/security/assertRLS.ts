/**
 * Strumento DIAGNOSTICO per verificare lo stato RLS delle tabelle.
 *
 * NON viene usato nelle API routes.
 * NON blocca nessuna request.
 * NON esegue query a pg_catalog automaticamente.
 *
 * Uso manuale:
 *   import { scanAllTablesRLS } from "@/lib/security/assertRLS"
 *   const report = await scanAllTablesRLS()
 *   // -> array di { table, rls_enabled, has_hotel_policy, safe }
 *
 * Pensato per endpoint diagnostici admin o script di CI/CD.
 */

import { createServiceRoleClient } from "@/lib/supabase/server"

// ─── types ────────────────────────────────────────────────────────

export interface RLSCheckResult {
  table: string
  rls_enabled: boolean
  has_hotel_policy: boolean
  safe: boolean
}

// ─── diagnostic scan (manual invocation only) ────────────────────

/**
 * Scansiona TUTTE le tabelle public e restituisce lo stato RLS.
 * Da invocare SOLO manualmente (admin endpoint, script CI/CD).
 * NON viene mai chiamata automaticamente dalle API routes.
 */
export async function scanAllTablesRLS(): Promise<RLSCheckResult[]> {
  const supabase = await createServiceRoleClient()

  const { data, error } = await supabase.rpc("exec_sql", {
    query: `
      SELECT
        t.tablename                       AS table_name,
        t.rowsecurity                     AS rls_enabled,
        EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.schemaname = 'public'
            AND p.tablename  = t.tablename
            AND (
              p.qual::text ILIKE '%hotel_id%'
              OR p.qual::text ILIKE '%organization_id%'
              OR p.qual::text ILIKE '%get_user_hotel_ids%'
              OR p.qual::text ILIKE '%auth.uid()%'
              OR p.qual::text ILIKE '%user_id%'
            )
        )                                 AS has_hotel_policy
      FROM pg_tables t
      WHERE t.schemaname = 'public'
      ORDER BY t.tablename
    `,
  })

  if (error || !data) {
    console.error("[SECURITY DIAG] Cannot scan tables:", error?.message)
    return []
  }

  return (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
    table: String(row.table_name),
    rls_enabled: row.rls_enabled === true,
    has_hotel_policy: row.has_hotel_policy === true,
    safe: row.rls_enabled === true && row.has_hotel_policy === true,
  }))
}

/**
 * Scansiona un sottoinsieme di tabelle e restituisce lo stato RLS.
 * Stesse regole di scanAllTablesRLS: solo uso manuale/diagnostico.
 */
export async function scanTablesRLS(tableNames: string[]): Promise<RLSCheckResult[]> {
  const supabase = await createServiceRoleClient()

  const tableList = tableNames.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")

  const { data, error } = await supabase.rpc("exec_sql", {
    query: `
      SELECT
        t.tablename                       AS table_name,
        t.rowsecurity                     AS rls_enabled,
        EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.schemaname = 'public'
            AND p.tablename  = t.tablename
            AND (
              p.qual::text ILIKE '%hotel_id%'
              OR p.qual::text ILIKE '%organization_id%'
              OR p.qual::text ILIKE '%get_user_hotel_ids%'
              OR p.qual::text ILIKE '%auth.uid()%'
              OR p.qual::text ILIKE '%user_id%'
            )
        )                                 AS has_hotel_policy
      FROM pg_tables t
      WHERE t.schemaname = 'public'
        AND t.tablename IN (${tableList})
      ORDER BY t.tablename
    `,
  })

  if (error || !data) {
    console.error("[SECURITY DIAG] Cannot scan tables:", error?.message)
    return []
  }

  return (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
    table: String(row.table_name),
    rls_enabled: row.rls_enabled === true,
    has_hotel_policy: row.has_hotel_policy === true,
    safe: row.rls_enabled === true && row.has_hotel_policy === true,
  }))
}
