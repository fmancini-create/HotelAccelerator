import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { sendEmail } from "@/lib/email"

export const dynamic = "force-dynamic"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Invia al webmaster dell'hotel le istruzioni + snippet di installazione del
 * Widget Recensioni. Auth: validateHotelAccess. Invio via sendEmail canonico
 * (mittente SANTADDEO, audit log, redirect dev).
 */
export async function POST(request: NextRequest) {
  let body: { hotelId?: string; email?: string; snippet?: string; senderName?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const hotelId = body.hotelId
  const email = (body.email || "").trim()
  const snippet = (body.snippet || "").trim()

  if (!hotelId) return NextResponse.json({ error: "hotelId required" }, { status: 400 })
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Email non valida" }, { status: 400 })
  }
  if (!snippet || !snippet.includes("<script")) {
    return NextResponse.json({ error: "Snippet mancante" }, { status: 400 })
  }

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied

  // Nome hotel per personalizzare l'email
  const svc = await createServiceRoleClient()
  const { data: hotel } = await svc.from("hotels").select("name").eq("id", hotelId).maybeSingle()
  const hotelName = hotel?.name || "la struttura"
  const senderName = (body.senderName || "").trim()

  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;line-height:1.6">
      <h2 style="color:#0d9488;margin-bottom:4px">Installazione Widget Recensioni</h2>
      <p style="margin-top:0;color:#6b7280">${escapeHtml(hotelName)}</p>
      <p>Ciao,</p>
      <p>
        ${senderName ? `<strong>${escapeHtml(senderName)}</strong> ti ha` : "Ti è stato"} inviato il codice
        per installare il <strong>Widget Recensioni</strong> sul sito di ${escapeHtml(hotelName)}.
        Il widget mostra i punteggi delle recensioni per canale (Booking, Google, TripAdvisor, Expedia).
      </p>
      <p style="margin-bottom:6px"><strong>Come installarlo:</strong> incolla questo snippet nel punto
        della pagina dove deve comparire il widget, prima della chiusura del tag <code>&lt;/body&gt;</code>.</p>
      <pre style="background:#0f172a;color:#e2e8f0;padding:16px;border-radius:8px;overflow-x:auto;font-size:13px;white-space:pre-wrap;word-break:break-all">${escapeHtml(
        snippet,
      )}</pre>
      <p style="font-size:13px;color:#6b7280;background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:12px">
        Nota: lo script misura anche, in forma <strong>anonima e aggregata</strong> (senza cookie né dati
        personali), le visite al sito. Questo segnale alimenta il motore di pricing di SANTADDEO Accelerator.
      </p>
      <p style="font-size:12px;color:#9ca3af;margin-top:24px">
        Email inviata tramite SANTADDEO Hotel Accelerator. Per assistenza: supporto@santaddeo.com
      </p>
    </div>`

  const result = await sendEmail({
    to: email,
    subject: `Codice di installazione Widget Recensioni — ${hotelName}`,
    html,
    type: "review_widget_install",
    hotelId,
    metadata: { senderName: senderName || undefined },
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Invio fallito" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
