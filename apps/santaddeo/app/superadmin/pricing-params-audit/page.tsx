/**
 * Audit log di pricing_algo_params
 *
 * Pagina super_admin per investigare scritture/cancellazioni della tabella
 * `pricing_algo_params`. Lo storico viene popolato automaticamente dal
 * trigger `trg_pricing_algo_params_audit` (vedi migration
 * `2026_04_30_add_pricing_algo_params_audit`).
 *
 * Use case primario (incident 30/04/2026): trovare chi/quando/cosa ha
 * cancellato i `rate_adj_*`/`room_type_adj_*`/`occ_adj_*` di Barronci dal
 * 1/5/2026 in poi. Per scritture FUTURE, l'audit log mostra anche
 * application_name, IP, query_text e txid raggruppante.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { SuperAdminHeader } from "@/components/superadmin/superadmin-header"
import { BackNavigation } from "@/components/superadmin/back-navigation"
import { AppFooter } from "@/components/layout/app-footer"
import { AuditViewer } from "@/components/superadmin/pricing-params-audit-viewer"

export const dynamic = "force-dynamic"

export default async function PricingParamsAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ hotel_id?: string; operation?: string; param_key?: string; limit?: string }>
}) {
  const isV0Preview = await isDevAuthAsync()
  const supabase = await createClient()

  if (!isV0Preview) {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      redirect("/auth/login")
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
    const isSuperAdmin = profile?.role === "superadmin" || profile?.role === "super_admin"
    if (!profile || !isSuperAdmin) {
      redirect("/dashboard")
    }
  }

  const sp = await searchParams
  const hotelFilter = sp.hotel_id ?? null
  const operationFilter = sp.operation ?? null
  const paramKeyFilter = sp.param_key ?? null
  const limit = Math.min(Number(sp.limit ?? "200"), 1000)

  // Hotel list per filtro
  const { data: hotels } = await supabase
    .from("hotels")
    .select("id, name")
    .order("name", { ascending: true })

  // Audit rows con filtri
  let q = supabase
    .from("pricing_algo_params_audit")
    .select(
      "id, ts, operation, hotel_id, param_key, date, old_value, new_value, session_user_name, application_name, client_addr, query_text, txid",
    )
    .order("ts", { ascending: false })
    .limit(limit)
  if (hotelFilter) q = q.eq("hotel_id", hotelFilter)
  if (operationFilter) q = q.eq("operation", operationFilter)
  if (paramKeyFilter) q = q.like("param_key", `${paramKeyFilter}%`)
  const { data: rows, error: rowsErr } = await q

  // Conteggi per visione "summary" delle ultime 24h
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: summaryAgg } = await supabase
    .from("pricing_algo_params_audit")
    .select("operation, hotel_id, ts")
    .gte("ts", since24h)
    .order("ts", { ascending: false })
    .limit(5000)

  const counts: Record<string, { insert: number; update: number; delete: number }> = {}
  if (summaryAgg) {
    for (const r of summaryAgg as Array<{
      operation: string
      hotel_id: string | null
    }>) {
      const k = r.hotel_id ?? "unknown"
      if (!counts[k]) counts[k] = { insert: 0, update: 0, delete: 0 }
      const op = r.operation.toLowerCase() as "insert" | "update" | "delete"
      if (op in counts[k]) counts[k][op]++
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SuperAdminHeader />
      <BackNavigation />
      <div className="container mx-auto py-8 px-4">
        <AuditViewer
          rows={rows ?? []}
          rowsError={rowsErr?.message ?? null}
          hotels={hotels ?? []}
          counts={counts}
          filters={{
            hotelId: hotelFilter,
            operation: operationFilter,
            paramKey: paramKeyFilter,
            limit,
          }}
        />
      </div>
      <AppFooter />
    </div>
  )
}
