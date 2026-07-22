import { NextResponse } from "next/server"
import { confirmLeadBooking } from "@/lib/sales/lead-call"

export const dynamic = "force-dynamic"

/**
 * Endpoint PUBBLICO (no auth): il lead conferma uno slot scelto.
 * Crea una bozza evento "tentative" + demo_request pending (da confermare dal
 * super admin). Validato dal token opaco.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const startIso = body?.startIso ? String(body.startIso) : null
  if (!startIso) return NextResponse.json({ error: "missing_slot" }, { status: 400 })

  try {
    const res = await confirmLeadBooking({ token, startIso })
    return NextResponse.json({ ok: true, ...res })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error"
    const map: Record<string, { status: number; message: string }> = {
      not_found: { status: 404, message: "Link di prenotazione non valido." },
      expired: { status: 410, message: "Questo link di prenotazione è scaduto." },
      used: { status: 409, message: "Hai già prenotato una call con questo link." },
      slot_unavailable: { status: 409, message: "L'orario scelto non è più disponibile. Scegline un altro." },
    }
    const info = map[msg] || { status: 500, message: "Impossibile completare la prenotazione." }
    return NextResponse.json({ error: msg, message: info.message }, { status: info.status })
  }
}
