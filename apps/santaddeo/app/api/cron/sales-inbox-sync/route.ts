import { type NextRequest, NextResponse } from "next/server"
import { syncSalesInboxReplies } from "@/lib/sales/inbox-reader"
import { withTimeout } from "@/lib/supabase/error-utils"
import { requireCronAuth } from "@/lib/cron-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * CRON: legge le caselle IMAP configurate (clienti@4bid.it +
 * noreply@santaddeo.com, dove confluiscono gli alias venditore) e registra le
 * RISPOSTE dei clienti alle email dei venditori in sales_lead_messages.
 *
 * Schedule consigliato: ogni 5 minuti `*\/5 * * * *`.
 * Idempotente: i messaggi gia' processati vengono marcati \Seen e deduplicati
 * per UID/message_id, quindi una seconda esecuzione non crea duplicati.
 *
 * Auth: Bearer CRON_SECRET (come gli altri cron). In assenza del segreto in
 * env (dev) l'endpoint resta aperto per consentire i test manuali.
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

  console.log("[sales-inbox-sync] starting")
  try {
    // GUARDIA COMPLESSIVA (fix 17/07/2026): oltre alle protezioni interne
    // (budget 40s, connect/lock/search con withTimeout), avvolgiamo l'INTERA
    // sync in un limite rigido a 55s < maxDuration=60s. Cosi', qualunque await
    // imprevisto si appenda, la function risponde in modo PULITO (503) invece di
    // farsi uccidere da Vercel a 60s (504 FUNCTION_INVOCATION_TIMEOUT, che
    // interrompe la richiesta senza risposta). Idempotente: si riprende al run
    // successivo.
    const result = await withTimeout(
      syncSalesInboxReplies({ maxMessages: 50 }),
      55_000,
      "sales-inbox-sync overall",
    )
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync_failed"
    const isTimeout = /timed out|timeout/i.test(msg)
    console.error("[sales-inbox-sync] error:", msg)
    // Timeout complessivo -> 503 (transitorio, il cron ritenta al prossimo run),
    // non 500: distingue un problema temporaneo da un errore applicativo.
    return NextResponse.json({ success: false, error: msg }, { status: isTimeout ? 503 : 500 })
  }
}
