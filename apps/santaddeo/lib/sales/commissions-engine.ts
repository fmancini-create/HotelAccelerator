/**
 * Commissions Engine — orchestrazione completa del ledger venditori.
 *
 * Modello:
 *  - Le commissioni venditore sono calcolate sulla FATTURA emessa al tenant
 *    (NON sul revenue lordo dell'hotel). La base puo' essere total o subtotal
 *    a seconda di commission_basis nel periodo storicizzato.
 *  - Lifecycle 4 stati:
 *      accrued  -> fattura emessa, venditore ha "maturato" la commissione
 *                  ma Santaddeo NON ha ancora incassato dal tenant.
 *      earned   -> tenant ha pagato la fattura: la commissione e' dovuta
 *                  al venditore (liquidabile).
 *      paid     -> Santaddeo ha pagato il venditore (bonifico fatto).
 *      voided   -> annullata (fattura cancellata o storno manuale).
 *  - Idempotenza: il vincolo UNIQUE (agent, hotel, year, month) garantisce
 *    che ogni mese ci sia al massimo 1 riga per coppia (agent, hotel).
 *
 * Tutti gli helper qui dentro usano il service_role client perche':
 *  (a) sales_agent_hotel_commission_periods e sales_commissions_ledger hanno
 *      RLS attivo e gli hook applicativi girano da contesti server-side senza
 *      session utente affidabile;
 *  (b) l'autorizzazione e' gia' validata a monte (super_admin guard nei route).
 *
 * Nessuna delle funzioni qui dentro lancia eccezioni: i fallimenti vengono
 * loggati su console.error con prefisso [v0][commissions]. Una commissione
 * non scritta non deve mai bloccare la creazione della fattura tenant.
 */

import { createServiceRoleClient } from "@/lib/supabase/server"
import { logSupabaseError } from "@/lib/supabase/error-utils"

export type LedgerStatus = "accrued" | "earned" | "paid" | "voided"
export type CommissionBasis = "invoice_total" | "invoice_subtotal"

interface InvoiceRow {
  id: string
  hotel_id: string | null
  status: string | null
  total: number | null
  subtotal: number | null
  period_start: string | null
  period_end: string | null
  issue_date: string | null
  paid_at: string | null
}

interface AgentRel {
  sales_agent_id: string
  hotel_id: string
}

/**
 * Estrae (year, month) di "competenza" della fattura. Prioritizza
 * period_start (mese fatturato), fallback issue_date, ultimo fallback now().
 */
function extractPeriod(inv: InvoiceRow): { year: number; month: number } {
  const dateStr = inv.period_start || inv.issue_date
  const d = dateStr ? new Date(dateStr) : new Date()
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

/**
 * Pct e basis del venditore per una specifica data.
 * 
 * Priorita':
 *   1. Cerca in sales_agent_hotel_commission_periods (storia esplicita)
 *   2. Fallback su sales_agent_hotels.commission_percentage (valore corrente)
 * 
 * Ritorna null SOLO se l'hotel non e' associato al venditore.
 */
async function lookupPctForDate(
  agentId: string,
  hotelId: string,
  refDate: string,
): Promise<{ pct: number; basis: CommissionBasis } | null> {
  const svc = await createServiceRoleClient()
  
  // 1. Prova prima la tabella periodi (storia esplicita)
  const { data, error } = await svc
    .from("sales_agent_hotel_commission_periods")
    .select("commission_percentage, commission_basis")
    .eq("sales_agent_id", agentId)
    .eq("hotel_id", hotelId)
    .lte("valid_from", refDate)
    .or(`valid_to.is.null,valid_to.gte.${refDate}`)
    .order("valid_from", { ascending: false })
    .limit(1)
    .maybeSingle()
  
  if (error) {
    console.error("[v0][commissions] lookupPctForDate periods error:", error)
  }
  
  if (data) {
    return {
      pct: Number(data.commission_percentage),
      basis: (data.commission_basis as CommissionBasis) ?? "invoice_total",
    }
  }
  
  // 2. Fallback: leggi da sales_agent_hotels (valore corrente, non storicizzato)
  const { data: sahRow, error: sahErr } = await svc
    .from("sales_agent_hotels")
    .select("commission_percentage, commission_basis")
    .eq("sales_agent_id", agentId)
    .eq("hotel_id", hotelId)
    .maybeSingle()
  
  if (sahErr) {
    console.error("[v0][commissions] lookupPctForDate fallback error:", sahErr)
    return null
  }
  
  if (!sahRow) {
    // Hotel non associato al venditore
    return null
  }
  
  return {
    pct: Number(sahRow.commission_percentage ?? 0),
    basis: (sahRow.commission_basis as CommissionBasis) ?? "invoice_total",
  }
}

/**
 * Ritorna l'agente associato a un hotel (relazione sales_agent_hotels).
 * Un hotel ha al massimo un venditore di riferimento.
 */
async function findAgentForHotel(hotelId: string): Promise<AgentRel | null> {
  const svc = await createServiceRoleClient()
  const { data, error } = await svc
    .from("sales_agent_hotels")
    .select("sales_agent_id, hotel_id")
    .eq("hotel_id", hotelId)
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error("[v0][commissions] findAgentForHotel error:", error)
    return null
  }
  return data as AgentRel | null
}

/**
 * RECONCILE: idempotente. Chiamare ogni volta che una fattura viene creata o
 * il suo stato/importo cambia. Crea o aggiorna la riga di ledger collegata.
 *
 * Regole di decisione:
 *  - Se la fattura non ha un hotel o non ha agente: nessuna azione.
 *  - Se la fattura e' "voided" (cancelled/voided/draft): la riga ledger
 *    collegata viene marcata voided (se esiste). Mai cancellata: serve come
 *    audit.
 *  - Se la fattura e' "paid" e c'e' un periodo pct: ledger va a 'earned'
 *    (skip 'accrued', e' gia' incassata).
 *  - Altrimenti (pending/overdue/sent...): ledger va a 'accrued'.
 *  - Se la riga ledger e' gia' 'paid': NON la tocchiamo (commissione gia'
 *    liquidata al venditore, sarebbe un rollback rischioso). Il superadmin
 *    deve agire manualmente in caso di disputa.
 */
export async function reconcileCommissionsForInvoice(invoiceId: string): Promise<void> {
  if (!invoiceId) return
  const svc = await createServiceRoleClient()

  const { data: inv, error: invErr } = await svc
    .from("invoices")
    .select("id, hotel_id, status, total, subtotal, period_start, period_end, issue_date, paid_at")
    .eq("id", invoiceId)
    .maybeSingle()
  if (invErr || !inv) {
    console.error("[v0][commissions] reconcile: invoice not found", invoiceId, invErr)
    return
  }
  const invoice = inv as InvoiceRow
  if (!invoice.hotel_id) return

  // Cerca riga ledger gia' esistente per questa invoice (potrebbe esserci
  // gia' da chiamate precedenti del cron o di un reconcile).
  const { data: existingLedger } = await svc
    .from("sales_commissions_ledger")
    .select("id, status, sales_agent_id, hotel_id")
    .eq("invoice_id", invoice.id)
    .maybeSingle()

  // Status invoice "annullato" o draft -> voida riga ledger se esiste
  const invoiceStatus = (invoice.status || "").toLowerCase()
  const isVoidedInvoice = ["cancelled", "voided", "void", "draft"].includes(invoiceStatus)
  if (isVoidedInvoice) {
    if (existingLedger && existingLedger.status !== "paid" && existingLedger.status !== "voided") {
      const { error: voidErr } = await svc
        .from("sales_commissions_ledger")
        .update({
          status: "voided",
          voided_at: new Date().toISOString(),
          voided_reason: `Fattura tenant in stato ${invoiceStatus}`,
        })
        .eq("id", existingLedger.id)
      if (voidErr) console.error("[v0][commissions] reconcile void error:", voidErr)
    }
    return
  }

  const agentRel = await findAgentForHotel(invoice.hotel_id)
  if (!agentRel) {
    // Hotel senza venditore: niente commissione, niente errore.
    return
  }

  // Lookup pct/basis per la data di competenza
  const refDate = invoice.period_start || invoice.issue_date || new Date().toISOString().slice(0, 10)
  const pctInfo = await lookupPctForDate(agentRel.sales_agent_id, invoice.hotel_id, refDate)
  if (!pctInfo) {
    console.warn(
      "[v0][commissions] no commission period for agent",
      agentRel.sales_agent_id,
      "hotel",
      invoice.hotel_id,
      "date",
      refDate,
    )
    return
  }

  const base = pctInfo.basis === "invoice_subtotal" ? Number(invoice.subtotal ?? 0) : Number(invoice.total ?? 0)
  const amount = Math.round(base * (pctInfo.pct / 100) * 100) / 100
  const { year, month } = extractPeriod(invoice)
  // period_start = primo giorno del mese di competenza (richiesto da DB, NOT NULL)
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`
  const nowIso = new Date().toISOString()
  const isPaid = invoiceStatus === "paid"

  // Se esiste gia' una riga 'paid': lascia stare (vedi commento sopra).
  if (existingLedger?.status === "paid") {
    return
  }

  const targetStatus: LedgerStatus = isPaid ? "earned" : "accrued"

  // UPSERT idempotente sul vincolo (agent, hotel, year, month)
  const upsertPayload: Record<string, unknown> = {
    sales_agent_id: agentRel.sales_agent_id,
    hotel_id: invoice.hotel_id,
    period_year: year,
    period_month: month,
    period_start: periodStart, // primo giorno del mese, richiesto da DB NOT NULL
    base_amount_eur: base,
    commission_percentage: pctInfo.pct,
    commission_basis: pctInfo.basis,
    amount_eur: amount,
    invoice_id: invoice.id,
    status: targetStatus,
    accrued_at: nowIso,
    // earned_at solo se ora siamo earned e prima non lo eravamo
    earned_at: isPaid ? invoice.paid_at || nowIso : null,
    voided_at: null,
    voided_reason: null,
  }

  const { error: upErr } = await svc
    .from("sales_commissions_ledger")
    .upsert(upsertPayload, { onConflict: "sales_agent_id,hotel_id,period_year,period_month" })
  if (upErr) {
    console.error("[v0][commissions] reconcile upsert error:", upErr, upsertPayload)
  }
}

/**
 * Chiamato esplicitamente quando una fattura passa a "paid" (UI superadmin).
 * Reconcile gestisce gia' questo caso, ma esporre la funzione dedicata rende
 * il codice piu' leggibile lato chiamante.
 */
export async function onInvoicePaid(invoiceId: string): Promise<void> {
  return reconcileCommissionsForInvoice(invoiceId)
}

/**
 * Chiamato quando una fattura torna da "paid" a un altro stato (es. correzione
 * dell'admin). Se la riga ledger e' "earned" non ancora pagata al venditore,
 * la rimettiamo "accrued". Se e' gia' "paid" (= venditore liquidato), NON
 * tocchiamo: serve azione manuale.
 */
export async function onInvoiceUnpaid(invoiceId: string): Promise<void> {
  const svc = await createServiceRoleClient()
  const { data: row } = await svc
    .from("sales_commissions_ledger")
    .select("id, status")
    .eq("invoice_id", invoiceId)
    .maybeSingle()
  if (!row) return
  if (row.status === "earned") {
    await svc
      .from("sales_commissions_ledger")
      .update({ status: "accrued", earned_at: null })
      .eq("id", row.id)
  }
}

/**
 * Cancellazione fattura: voida la riga ledger collegata se non gia' paid.
 */
export async function onInvoiceDeleted(invoiceId: string): Promise<void> {
  const svc = await createServiceRoleClient()
  const { data: row } = await svc
    .from("sales_commissions_ledger")
    .select("id, status")
    .eq("invoice_id", invoiceId)
    .maybeSingle()
  if (!row) return
  if (row.status === "paid") return // gia' liquidata: lascia traccia
  await svc
    .from("sales_commissions_ledger")
    .update({
      status: "voided",
      voided_at: new Date().toISOString(),
      voided_reason: "Fattura tenant eliminata",
    })
    .eq("id", row.id)
}

/**
 * Superadmin: paga il venditore. Passa da earned (o accrued, override esplicito)
 * a paid. Imposta payment_method/reference per audit. Ritorna il record
 * aggiornato.
 */
export async function markCommissionPaid(
  ledgerId: string,
  opts: {
    paymentMethod?: string | null
    paymentReference?: string | null
    notes?: string | null
    allowFromAccrued?: boolean
  } = {},
): Promise<{ ok: true; ledger: any } | { ok: false; error: string }> {
  const svc = await createServiceRoleClient()
  const { data: row, error: readErr } = await svc
    .from("sales_commissions_ledger")
    .select("id, status, amount_eur")
    .eq("id", ledgerId)
    .maybeSingle()
  if (readErr || !row) return { ok: false, error: readErr?.message || "Ledger non trovato" }
  if (row.status === "paid") return { ok: false, error: "Commissione gia' liquidata" }
  if (row.status === "voided") return { ok: false, error: "Commissione annullata" }
  if (row.status === "accrued" && !opts.allowFromAccrued) {
    return {
      ok: false,
      error:
        "La commissione e' in stato 'maturata' (tenant non ha ancora pagato). Conferma il pagamento solo se vuoi anticipare la liquidazione.",
    }
  }

  const nowIso = new Date().toISOString()
  const patch: Record<string, unknown> = {
    status: "paid",
    paid_at: nowIso,
  }
  if (opts.paymentMethod !== undefined) patch.payment_method = opts.paymentMethod
  if (opts.paymentReference !== undefined) patch.payment_reference = opts.paymentReference
  if (opts.notes !== undefined) patch.notes = opts.notes

  const { data: updated, error } = await svc
    .from("sales_commissions_ledger")
    .update(patch)
    .eq("id", ledgerId)
    .select()
    .single()
  if (error || !updated) return { ok: false, error: error?.message || "Update fallito" }

  return { ok: true, ledger: updated }
}

/**
 * Superadmin: void manuale di una riga ledger (es. correzione contabile).
 * Solo se non gia' paid (richiede un'azione di rimborso separata, non
 * gestita qui).
 */
export async function voidCommission(
  ledgerId: string,
  reason: string,
): Promise<{ ok: true; ledger: any } | { ok: false; error: string }> {
  const svc = await createServiceRoleClient()
  const { data: row } = await svc
    .from("sales_commissions_ledger")
    .select("status")
    .eq("id", ledgerId)
    .maybeSingle()
  if (!row) return { ok: false, error: "Ledger non trovato" }
  if (row.status === "paid") {
    return { ok: false, error: "Riga gia' liquidata: serve azione di rimborso, non void." }
  }
  const { data, error } = await svc
    .from("sales_commissions_ledger")
    .update({
      status: "voided",
      voided_at: new Date().toISOString(),
      voided_reason: reason || "Void manuale",
    })
    .eq("id", ledgerId)
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, ledger: data }
}

/**
 * Sweep mensile: scansiona TUTTE le fatture del mese passato e fa reconcile.
 * Idempotente: una fattura gia' processata viene aggiornata se cambia
 * (es. era 'pending' a fine mese, ora e' 'paid'). Usata dal cron mensile
 * come safety net se gli hook applicativi avessero perso qualche evento.
 */
export async function reconcileMonthSweep(year: number, month: number): Promise<{
  scanned: number
  reconciled: number
  errors: number
}> {
  const svc = await createServiceRoleClient()

  // Range mese: prendiamo fatture la cui period_start cade nel mese (preferito)
  // OR la cui issue_date cade nel mese (fallback per fatture senza period).
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10)
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)

  const { data: invs, error } = await svc
    .from("invoices")
    .select("id")
    .or(`and(period_start.gte.${start},period_start.lte.${end}),and(period_start.is.null,issue_date.gte.${start},issue_date.lte.${end})`)
    .limit(1000)

  if (error) {
    // Outage gateway Supabase (522/HTML): logga compatto (no blob HTML) e
    // declassa a warning. Vedi memoria santaddeo-supabase-outage-failfast.
    logSupabaseError("commissions reconcileMonthSweep query", error)
    return { scanned: 0, reconciled: 0, errors: 1 }
  }

  let reconciled = 0
  let errors = 0
  for (const inv of invs || []) {
    try {
      await reconcileCommissionsForInvoice(inv.id as string)
      reconciled++
    } catch (e) {
      console.error("[v0][commissions] sweep reconcile error invoice", inv.id, e)
      errors++
    }
  }
  return { scanned: invs?.length || 0, reconciled, errors }
}
