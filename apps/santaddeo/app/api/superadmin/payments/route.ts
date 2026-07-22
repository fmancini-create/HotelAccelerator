import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

/**
 * Auth guard: super_admin reale, oppure bypass in v0 preview (nessuna sessione).
 */
async function assertSuperAdmin() {
  if (await isDevAuthAsync()) return { ok: true as const, userId: null as string | null }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (profile?.role !== "super_admin") {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { ok: true as const, userId: user.id }
}

interface PaymentInput {
  payment_date?: unknown
  hotel_id?: unknown
  organization_name?: unknown
  amount?: unknown
  payment_method?: unknown
  reference?: unknown
  notes?: unknown
  source?: unknown
  bank_sender?: unknown
  import_batch_id?: unknown
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length ? t : null
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    let c = v.replace(/[€$\s]/g, "").trim()
    if (c.includes(",") && c.includes(".")) c = c.replace(/\./g, "").replace(",", ".")
    else if (c.includes(",")) c = c.replace(",", ".")
    const n = Number.parseFloat(c)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function dateStr(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (m) {
    let [, d, mo, y] = m
    if (y.length === 2) y = `20${y}`
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`
  }
  return null
}

type NormalizeResult =
  | { error: string; record?: undefined }
  | { error?: undefined; record: Record<string, unknown> }

/** Normalizza una riga in input verso un record valido, o restituisce un errore. */
function normalizeRow(raw: PaymentInput, userId: string | null): NormalizeResult {
  const payment_date = dateStr(raw.payment_date)
  const amount = num(raw.amount)
  if (!payment_date) return { error: "Data pagamento mancante o non valida" }
  if (amount === null) return { error: "Importo mancante o non valido" }
  const hotel_id = isUuid(raw.hotel_id) ? raw.hotel_id : null
  return {
    record: {
      payment_date,
      amount,
      hotel_id,
      organization_name: str(raw.organization_name),
      payment_method: str(raw.payment_method) ?? "bonifico",
      reference: str(raw.reference),
      notes: str(raw.notes),
      source: str(raw.source) ?? "manual",
      bank_sender: str(raw.bank_sender),
      import_batch_id: isUuid(raw.import_batch_id) ? raw.import_batch_id : null,
      created_by: userId,
    },
  }
}

/**
 * Forma unificata di una riga di pagamento mostrata nel registro.
 * `origin` distingue la fonte: "manual"/"bank_import" (tabella payments) o
 * "invoice" (tabella invoice_payments, collegata a una fattura).
 */
function mapInvoicePayment(p: any) {
  const inv = p.invoice || null
  return {
    id: p.id,
    payment_date: p.payment_date,
    hotel_id: inv?.hotel_id ?? null,
    organization_name: inv?.hotel?.name ?? null,
    amount: Number(p.amount || 0),
    payment_method: null as string | null,
    reference: inv?.invoice_number ?? null,
    notes: p.notes ?? null,
    source: "invoice",
    bank_sender: null,
    created_at: p.created_at,
    hotels: inv?.hotel ?? null,
    // campi specifici fattura
    origin: "invoice" as const,
    invoice_id: inv?.id ?? null,
    invoice_number: inv?.invoice_number ?? null,
    invoice_status: inv?.status ?? null,
    invoice_total: inv?.total ?? null,
    is_backfill: !!p.is_backfill,
  }
}

/**
 * GET /api/superadmin/payments
 * Registro pagamenti UNIFICATO: include sia i pagamenti liberi (tabella
 * `payments`, origin manual/bank_import) sia i pagamenti collegati alle
 * fatture (tabella `invoice_payments`, origin invoice), in un'unica lista.
 * Filtri opzionali: hotelId, from, to (YYYY-MM-DD), method, search, origin.
 *   - origin = all (default) | manual | bank_import | invoice
 * Ordinata per payment_date DESC, created_at DESC.
 */
export async function GET(req: NextRequest) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const hotelId = searchParams.get("hotelId")
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const method = searchParams.get("method")
  const search = searchParams.get("search")
  const origin = (searchParams.get("origin") || "all").toLowerCase()

  const sb = await createServiceRoleClient()
  const wantRegistry = origin === "all" || origin === "manual" || origin === "bank_import"
  const wantInvoices = origin === "all" || origin === "invoice"
  const s = (search || "").trim().replace(/[%,]/g, "")

  // --- 1) Pagamenti liberi (tabella payments) ---
  let registry: any[] = []
  if (wantRegistry) {
    let q = sb
      .from("payments")
      .select("*, hotels(id, name)")
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })

    if (isUuid(hotelId)) q = q.eq("hotel_id", hotelId)
    if (from) q = q.gte("payment_date", from)
    if (to) q = q.lte("payment_date", to)
    if (method) q = q.eq("payment_method", method)
    if (origin === "manual" || origin === "bank_import") q = q.eq("source", origin)
    if (s) q = q.or(`organization_name.ilike.%${s}%,reference.ilike.%${s}%,bank_sender.ilike.%${s}%`)

    const { data, error } = await q
    if (error) {
      console.error("[v0] payments GET (registry) error:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    registry = (data ?? []).map((r) => ({ ...r, origin: r.source === "bank_import" ? "bank_import" : "manual" }))
  }

  // --- 2) Pagamenti su fatture (tabella invoice_payments) ---
  // Saltati se l'utente filtra per una modalita' specifica (le fatture non
  // hanno payment_method) o per origin manual/bank_import.
  let invoices: any[] = []
  if (wantInvoices && !method) {
    let q = sb
      .from("invoice_payments")
      .select(
        `id, amount, payment_date, notes, is_backfill, created_at,
         invoice:invoices!inner ( id, invoice_number, total, status, hotel_id, hotel:hotels ( id, name ) )`,
      )
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2000)

    if (isUuid(hotelId)) q = q.eq("invoice.hotel_id", hotelId)
    if (from) q = q.gte("payment_date", from)
    if (to) q = q.lte("payment_date", to)

    const { data, error } = await q
    if (error) {
      console.error("[v0] payments GET (invoices) error:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    invoices = (data ?? []).map(mapInvoicePayment)
    if (s) {
      const lc = s.toLowerCase()
      invoices = invoices.filter(
        (p) =>
          (p.invoice_number || "").toLowerCase().includes(lc) ||
          (p.organization_name || "").toLowerCase().includes(lc),
      )
    }
  }

  // --- 3) Merge + sort ---
  const merged = [...registry, ...invoices].sort((a, b) => {
    if (a.payment_date !== b.payment_date) return a.payment_date < b.payment_date ? 1 : -1
    return (a.created_at || "") < (b.created_at || "") ? 1 : -1
  })

  return NextResponse.json({ payments: merged })
}

/**
 * POST /api/superadmin/payments
 * Crea uno o più pagamenti. Body: { payments: PaymentInput[] } oppure singolo PaymentInput.
 */
export async function POST(req: NextRequest) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 })
  }

  const rows: PaymentInput[] = Array.isArray((body as { payments?: unknown })?.payments)
    ? ((body as { payments: PaymentInput[] }).payments)
    : [body as PaymentInput]

  if (!rows.length) return NextResponse.json({ error: "Nessun pagamento da salvare" }, { status: 400 })

  const records: Record<string, unknown>[] = []
  const errors: { index: number; error: string }[] = []
  rows.forEach((r, i) => {
    const n = normalizeRow(r, auth.userId)
    if (n.record) records.push(n.record)
    else errors.push({ index: i, error: n.error })
  })

  if (!records.length) {
    return NextResponse.json({ error: "Tutte le righe non sono valide", details: errors }, { status: 400 })
  }

  const sb = await createServiceRoleClient()
  const { data, error } = await sb.from("payments").insert(records).select("*, hotels(id, name)")
  if (error) {
    console.error("[v0] payments POST error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ inserted: data?.length ?? 0, payments: data ?? [], skipped: errors })
}

/**
 * PATCH /api/superadmin/payments
 * Aggiorna un pagamento esistente. Body: { id, ...campi }.
 */
export async function PATCH(req: NextRequest) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  let body: (PaymentInput & { id?: unknown }) | null = null
  try {
    body = (await req.json()) as PaymentInput & { id?: unknown }
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 })
  }
  if (!isUuid(body?.id)) return NextResponse.json({ error: "id mancante o non valido" }, { status: 400 })

  const n = normalizeRow(body, auth.userId)
  if (!n.record) return NextResponse.json({ error: n.error }, { status: 400 })

  // Non sovrascrivere created_by / source / import_batch_id in update.
  const { created_by: _cb, source: _s, import_batch_id: _ib, ...patch } = n.record

  const sb = await createServiceRoleClient()
  const { data, error } = await sb
    .from("payments")
    .update(patch)
    .eq("id", body.id)
    .select("*, hotels(id, name)")
    .maybeSingle()
  if (error) {
    console.error("[v0] payments PATCH error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ payment: data })
}

/**
 * DELETE /api/superadmin/payments?id=<uuid>
 */
export async function DELETE(req: NextRequest) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!isUuid(id)) return NextResponse.json({ error: "id mancante o non valido" }, { status: 400 })

  const sb = await createServiceRoleClient()
  const { error } = await sb.from("payments").delete().eq("id", id)
  if (error) {
    console.error("[v0] payments DELETE error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
