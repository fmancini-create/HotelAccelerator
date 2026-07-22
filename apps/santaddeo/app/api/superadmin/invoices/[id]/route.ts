import { NextResponse } from "next/server"
import { put, del } from "@vercel/blob"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import {
  onInvoiceDeleted,
  reconcileCommissionsForInvoice,
} from "@/lib/sales/commissions-engine"

/**
 * PATCH /api/superadmin/invoices/[id]
 *   Modifica una fattura esistente. Accetta multipart o JSON.
 *   Se viene caricato un nuovo PDF, il vecchio file Blob viene cancellato
 *   per evitare orfani sullo storage.
 *
 * DELETE /api/superadmin/invoices/[id]
 *   Cancella la fattura e il relativo PDF su Blob (se presente).
 */

async function assertSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  if (profile?.role !== "super_admin") {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { ok: true as const }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params
  const sb = await createServiceRoleClient()

  const contentType = request.headers.get("content-type") || ""
  const update: Record<string, unknown> = {}
  let newPdfFile: File | null = null

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData()
    const f = form.get("file") as File | null
    if (f && f.size > 0) newPdfFile = f

    const map: Record<string, string> = {
      invoiceNumber: "invoice_number",
      issueDate: "issue_date",
      periodStart: "period_start",
      periodEnd: "period_end",
      subtotal: "subtotal",
      tax: "tax",
      total: "total",
      dueDate: "due_date",
      paidAt: "paid_at",
      paidAmount: "paid_amount",
      status: "status",
      planType: "plan_type",
      notes: "notes",
    }
    for (const [formKey, dbKey] of Object.entries(map)) {
      const v = form.get(formKey)
      if (v === null) continue
      const s = String(v).trim()
      if (["subtotal", "tax", "total", "paid_amount"].includes(dbKey)) {
        update[dbKey] = s === "" ? null : Number(s)
      } else {
        update[dbKey] = s === "" ? null : s
      }
    }

    // Auto-bump status: se paid_amount copre total, diventa 'paid'.
    // Per sapere total potremmo aver bisogno della riga corrente: lo
    // calcoliamo nel server se mancano campi nel form.
    const incomingTotal = update.total as number | null | undefined
    const incomingPaidAmount = update.paid_amount as number | null | undefined
    const incomingStatus = update.status as string | undefined
    const incomingPaidAt = update.paid_at as string | null | undefined
    if (
      incomingPaidAmount != null &&
      incomingTotal != null &&
      incomingPaidAmount >= incomingTotal &&
      incomingStatus !== "cancelled" &&
      incomingStatus !== "draft"
    ) {
      update.status = "paid"
    } else if (incomingPaidAt && incomingPaidAmount == null) {
      // Back-compat: data pagamento senza importo => pagato in toto
      if (!incomingStatus || incomingStatus === "pending" || incomingStatus === "overdue") {
        update.status = "paid"
      }
    }
  } else {
    // JSON fallback (modifica veloce di status/paid_at senza upload)
    const body = await request.json().catch(() => ({}))
    Object.assign(update, body)
  }

  // Gestione nuovo PDF: carica e cancella il vecchio
  if (newPdfFile) {
    if (newPdfFile.type !== "application/pdf") {
      return NextResponse.json({ error: "Il file deve essere un PDF" }, { status: 400 })
    }
    if (newPdfFile.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "PDF deve essere < 10 MB" }, { status: 400 })
    }

    // Recupera vecchio pdf_url + hotel_id per il path
    const { data: existing } = await sb
      .from("invoices")
      .select("pdf_url, hotel_id")
      .eq("id", id)
      .maybeSingle()

    try {
      const blob = await put(
        `invoices/${existing?.hotel_id}/${Date.now()}-${newPdfFile.name}`,
        newPdfFile,
        { access: "private", contentType: "application/pdf", addRandomSuffix: true },
      )
      update.pdf_url = blob.url
      update.pdf_file_name = newPdfFile.name
      update.pdf_file_size = newPdfFile.size
    } catch (err: any) {
      console.error("[v0] superadmin invoice PDF replace upload failed:", err)
      return NextResponse.json({ error: `Upload PDF fallito: ${err?.message || "errore"}` }, { status: 500 })
    }

    if (existing?.pdf_url) {
      // Best-effort: elimina il vecchio file. Se fallisce non blocca l'update.
      del(existing.pdf_url).catch((e) =>
        console.error("[v0] failed to delete old invoice PDF:", e),
      )
    }
  }

  const { data, error } = await sb
    .from("invoices")
    .update(update)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    console.error("[v0] superadmin invoice patch failed:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Reconcile: gestisce sia il caso "status passato a paid" che il rollback.
  // L'engine guarda lo status corrente della invoice e applica la transizione.
  reconcileCommissionsForInvoice(id).catch((e) =>
    console.error("[v0] reconcile commissions on invoice patch failed:", e),
  )

  return NextResponse.json({ invoice: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params
  const sb = await createServiceRoleClient()

  const { data: existing } = await sb
    .from("invoices")
    .select("pdf_url")
    .eq("id", id)
    .maybeSingle()

  // Prima di eliminare la fattura, voida la commissione collegata (se esiste
  // e non e' gia' paid). Lo facciamo PRIMA della delete perche' la FK del
  // ledger ha ON DELETE SET NULL: dopo la delete perderemmo il legame.
  await onInvoiceDeleted(id).catch((e) =>
    console.error("[v0] void commission on invoice delete failed:", e),
  )

  const { error } = await sb.from("invoices").delete().eq("id", id)
  if (error) {
    console.error("[v0] superadmin invoice delete failed:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (existing?.pdf_url) {
    del(existing.pdf_url).catch((e) =>
      console.error("[v0] failed to delete invoice PDF:", e),
    )
  }

  return NextResponse.json({ success: true })
}
