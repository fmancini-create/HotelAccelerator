import { NextResponse } from "next/server"

/**
 * Riconosce il diniego della guardia di area (vedi lib/auth-property.ts).
 *
 * Riconosciuto per NOME e non con `instanceof`, di proposito: importare la
 * classe da `lib/auth-property` creerebbe un ciclo fra i moduli, e il nome
 * sopravvive comunque alla serializzazione fra i confini del runtime.
 *
 * DEVE restare stretto. Se allargassi la condizione (per esempio a un generico
 * /forbidden/i sul messaggio) trasformerei in 403 anche guasti veri, cioe'
 * nasconderei errori del server dietro un "permesso negato". Meglio un 500 di
 * troppo che un guasto travestito da rifiuto.
 */
export function isAreaDenied(error: unknown): boolean {
  return error instanceof Error && error.name === "AreaAccessDenied"
}

/**
 * Risposta 403 per un diniego di area.
 *
 * Serve a distinguere "non hai il permesso per questa sezione" da "il server e'
 * rotto": senza questa distinzione l'interfaccia mostra un errore tecnico a chi
 * ha semplicemente un permesso in meno, e chi legge i log vede guasti che non
 * esistono.
 */
export function areaDeniedResponse(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "Accesso negato"
  return NextResponse.json({ error: message, code: "AREA_FORBIDDEN" }, { status: 403 })
}
