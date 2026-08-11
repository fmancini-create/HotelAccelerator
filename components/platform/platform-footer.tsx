"use client"

/**
 * Footer dell'area interna (admin).
 *
 * Espone DUE componenti, montati in punti diversi dalla struttura
 * (`PlatformShell`), perche' le pagine interne sono di due tipi:
 *
 *   PlatformFooter     footer completo, uguale a quello delle pagine
 *                      pubbliche: scorre INSIEME al contenuto.
 *   PlatformFooterBar  barra sottile fissata in fondo: serve solo alle
 *                      pagine a tutta altezza (Inbox), dove un footer alto
 *                      mangerebbe lo spazio delle colonne.
 *
 * I due si escludono a vicenda tramite `isFullHeightAdminPage`, cosi' nessuna
 * pagina resta senza footer e nessuna ne mostra due.
 *
 * Il footer completo NON e' una nuova variante: e' esattamente il componente
 * delle pagine pubbliche. Il progetto aveva gia' tre footer diversi, due dei
 * quali quasi omonimi; qui si riusa, non si aggiunge. L'import e' rinominato
 * di proposito (`CompanyFooter`) perche' i due file esportano lo stesso nome
 * `PlatformFooter` e la somiglianza ha gia' causato un errore in passato.
 *
 * Sono componenti client perche' devono conoscere la rotta corrente.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import { PlatformFooter as CompanyFooter } from "@/components/platform-footer"
import { isFullHeightAdminPage } from "@/components/platform/platform-chrome-routes"

/**
 * Footer completo con dati societari, mostrato su tutte le pagine interne
 * tranne quelle a tutta altezza.
 *
 * Va montato DENTRO l'area che scorre: la struttura admin e' un riquadro
 * rigido di 100dvh, quindi un footer alto fissato in fondo ruberebbe altezza
 * al contenuto invece di stare sotto di esso.
 *
 * Sicuro anche sulle pagine di accesso: i suoi link puntano solo a pagine
 * pubbliche (funzionalita', privacy, termini, richiesta demo). La vecchia
 * barra sottile doveva nascondere i propri link sulle pagine di accesso
 * perche' puntavano a sezioni riservate, che avrebbero rimbalzato al login.
 */
export function PlatformFooter() {
  const pathname = usePathname() || ""

  if (isFullHeightAdminPage(pathname)) return null

  return <CompanyFooter />
}

/**
 * Barra sottile fissata in fondo, riservata alle pagine a tutta altezza.
 *
 * Resta volutamente minima (36px) per non sottrarre spazio alle colonne della
 * Inbox, che gestiscono uno scorrimento proprio.
 */
export function PlatformFooterBar() {
  const pathname = usePathname() || ""
  const year = new Date().getFullYear()

  if (!isFullHeightAdminPage(pathname)) return null

  return (
    <footer
      className="flex-shrink-0 h-9 border-t border-border bg-background text-muted-foreground text-[11px]"
      aria-label="Footer piattaforma"
    >
      <div className="h-full flex items-center justify-between px-3 sm:px-4 gap-4">
        <div className="flex items-center gap-3">
          <span className="truncate">&copy; {year} 4Bid S.r.l.</span>
          <span className="hidden sm:inline text-muted-foreground/40">|</span>
          <span className="hidden sm:inline truncate">P. IVA 06241710489</span>
        </div>
        <nav className="flex items-center gap-3" aria-label="Link utili">
          <Link href="/privacy" className="hover:text-ha-brand-soft-foreground transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-ha-brand-soft-foreground transition-colors">
            Termini
          </Link>
        </nav>
      </div>
    </footer>
  )
}
