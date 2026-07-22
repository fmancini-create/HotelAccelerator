/**
 * POST /api/superadmin/sales-commissions/backfill
 * 
 * Esegue il backfill delle commissioni per tutte le fatture esistenti
 * che hanno un venditore associato ma nessuna riga nel ledger.
 * 
 * Body opzionale: { hotel_id?: string } per limitare a un singolo hotel.
 */
import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { reconcileCommissionsForInvoice } from "@/lib/sales/commissions-engine"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const svc = await createServiceRoleClient()

  // Verifica super_admin
  const { data: { user } } = await svc.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 })
  }

  let hotelIdFilter: string | null = null
  let startDateFilter: string | null = null
  try {
    const body = await request.json().catch(() => ({}))
    hotelIdFilter = body.hotel_id || null
    startDateFilter = body.start_date || null
  } catch {
    // no body, procedi con tutti
  }

  // Trova tutte le fatture che hanno un hotel con venditore associato
  // ma che NON hanno ancora una riga nel ledger
  let query = svc
    .from("invoices")
    .select(`
      id,
      hotel_id,
      issue_date,
      hotels!inner(
        id,
        sales_agent_hotels!inner(sales_agent_id)
      )
    `)
    .not("hotel_id", "is", null)
    .not("status", "in", '("cancelled","voided","draft")')

  if (hotelIdFilter) {
    query = query.eq("hotel_id", hotelIdFilter)
  }
  
  // Filtra per data di partenza (issue_date >= start_date)
  if (startDateFilter) {
    query = query.gte("issue_date", startDateFilter)
  }

  const { data: invoices, error: invErr } = await query.limit(500)

  if (invErr) {
    console.error("[v0][backfill] query error:", invErr)
    return NextResponse.json({ error: invErr.message }, { status: 500 })
  }

  // Filtra quelle che non hanno già una riga nel ledger
  const invoiceIds = (invoices || []).map((i: any) => i.id)
  
  const { data: existingLedger } = await svc
    .from("sales_commissions_ledger")
    .select("invoice_id")
    .in("invoice_id", invoiceIds.length > 0 ? invoiceIds : ["__none__"])

  const existingSet = new Set((existingLedger || []).map((r: any) => r.invoice_id))
  const toProcess = invoiceIds.filter((id: string) => !existingSet.has(id))

  let processed = 0
  let errors = 0
  const errorDetails: string[] = []

  for (const invoiceId of toProcess) {
    try {
      await reconcileCommissionsForInvoice(invoiceId)
      processed++
    } catch (e: any) {
      errors++
      errorDetails.push(`${invoiceId}: ${e.message}`)
    }
  }

  return NextResponse.json({
    total_invoices: invoiceIds.length,
    already_in_ledger: existingSet.size,
    processed,
    errors,
    errorDetails: errorDetails.slice(0, 10),
  })
}
