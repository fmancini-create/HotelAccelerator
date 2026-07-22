import { NextResponse } from "next/server"

/**
 * Guardia centralizzata per le route /api/cron/*.
 *
 * Comportamento:
 * - Se CRON_SECRET e' impostato: richiede l'header esatto
 *   `Authorization: Bearer ${CRON_SECRET}`, altrimenti 401.
 *   Vale SEMPRE: production, preview e locale.
 * - Se CRON_SECRET NON e' impostato: su Vercel (VERCEL_ENV presente,
 *   quindi production o preview) risponde sempre 401. Solo il local
 *   development (VERCEL_ENV assente) puo' procedere senza segreto.
 *
 * Nota: il vecchio pattern `if (VERCEL_ENV === "production" && CRON_SECRET)`
 * lasciava le preview completamente aperte; il confronto secco
 * `authHeader !== \`Bearer ${CRON_SECRET}\`` senza controllo di presenza
 * era bypassabile con il literal "Bearer undefined" a secret assente.
 *
 * @returns una NextResponse 401 da restituire subito, oppure null se autorizzato.
 */
export function requireCronAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")

  if (secret) {
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return null
  }

  // Nessun CRON_SECRET configurato: mai eseguire su Vercel (prod o preview).
  if (process.env.VERCEL_ENV) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Solo sviluppo locale.
  return null
}
