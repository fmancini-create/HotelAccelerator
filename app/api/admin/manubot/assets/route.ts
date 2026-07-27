/**
 * GET /api/admin/manubot/assets — elenco asset (impianti) da ManuBot.
 *
 * READ-ONLY: nessuna scrittura su DB, nessuna creazione/modifica di task,
 * nessun webhook, nessun Telegram/WhatsApp/Stripe.
 *
 * HARDENING: prima questa route era PUBBLICA (nessun guard) e restituiva
 * `error.message` grezzo, quindi chiunque da internet poteva leggere sia la
 * lista degli asset sia messaggi interni tipo
 * "Login Manubot fallito: Invalid login credentials".
 * Ora richiede una sessione con privilegi di amministratore e restituisce solo
 * una categoria d'errore generica (vedi lib/manubot/route-errors.ts).
 */

import { type NextRequest, NextResponse } from "next/server"
import { getManubotClient } from "@/lib/manubot"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { categorizeManubotError, logManubotError } from "@/lib/manubot/route-errors"

export async function GET(request: NextRequest) {
  // Guard: sessione valida + privilegi admin/super admin.
  // NB: non si usa requireTenantAdmin perché non serve un tenant *selezionato*
  // (un super admin senza impersonificazione attiva non ne ha uno) e perché
  // questa route non scrive nulla.
  const identity = await getCallerIdentity(request)
  if (!identity) {
    return NextResponse.json({ error: "unauthorized", assets: [] }, { status: 401 })
  }
  if (!identity.isSuperAdmin && !identity.isTenantAdmin) {
    return NextResponse.json({ error: "forbidden", assets: [] }, { status: 403 })
  }

  try {
    const client = await getManubotClient({})
    const assets = await client.getAssets()
    return NextResponse.json({ assets })
  } catch (error) {
    // Il messaggio reale resta nei log del server, mai in risposta.
    const category = categorizeManubotError(error)
    logManubotError("manubot/assets", error, category)
    return NextResponse.json({ error: category, assets: [] }, { status: 500 })
  }
}
