/**
 * Regole di struttura delle pagine interne (area admin).
 *
 * Punto UNICO di verita': la struttura monta il footer in due posizioni
 * diverse (dentro l'area che scorre, oppure fissato in fondo) e le due
 * decisioni devono restare coerenti. Tenerle in due file separati e' il modo
 * piu' rapido per farle divergere.
 */

/**
 * Pagine che occupano da sole tutta l'altezza della finestra, in stile Gmail:
 * hanno colonne con scorrimento proprio e NON devono avere contenuto sotto,
 * altrimenti l'intera pagina inizia a scorrere e la struttura si rompe.
 *
 * Verificato leggendo la radice delle pagine: solo la Inbox lo fa davvero
 * (`<div className="h-full flex flex-col">`). Le altre candidate trovate
 * cercando `h-full` erano falsi positivi - schede, immagini, barre di
 * avanzamento - e usano il flusso normale.
 */
export function isFullHeightAdminPage(pathname: string): boolean {
  return pathname === "/admin/inbox" || pathname.startsWith("/admin/inbox/")
}
