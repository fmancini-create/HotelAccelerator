"use client"

/**
 * Il cruscotto di /admin.
 *
 * Prima questa pagina era una griglia di 18 scorciatoie che ripeteva il menu
 * (alcune segnate "Prossimamente") e mostrava tutto a tutti, filtrando solo su
 * `can_manage_users`: un quarto elenco di destinazioni scritto a mano, che
 * ignorava aree concesse, moduli attivi e gruppi.
 *
 * Ora la pagina non decide nulla: chiede a /api/platform/dashboard QUALI
 * pannelli mostrare e con quali numeri. La regola di visibilita' vive in un solo
 * posto (lib/platform/dashboard.ts) e il server la applica prima di rispondere,
 * cosi' i dati riservati non partono nemmeno.
 *
 * La pagina non disegna una propria testata: la barra con struttura, utente ed
 * uscita e' gia' fornita da PlatformShell nel layout. Prima ce n'erano due, una
 * sopra l'altra, con due pulsanti "Esci".
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, TriangleAlert } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { DashboardCard } from "@/components/admin/dashboard/dashboard-cards"
import { PlatformOverviewPanel } from "@/components/platform/platform-overview-panel"
import {
  DASHBOARD_PANELS,
  PANEL_KIND_LABEL,
  PANEL_ORDER,
  type PanelKind,
} from "@/lib/platform/dashboard"

interface Risposta {
  isAdmin: boolean
  /**
   * Solo per chi amministra la piattaforma. Distinto da `isAdmin`, che comprende
   * anche l'amministratore di una struttura. Assente nelle risposte piu'
   * vecchie: `undefined` significa "non mostrare", cioe' fail-closed.
   */
  isPlatformAdmin?: boolean
  profilo: string
  /** Id dei pannelli che questa persona puo' vedere, decisi dal server. */
  panels: string[]
  dati: Record<string, any>
}

/**
 * Utilizzo risorse: conteggi reali contro i limiti del piano.
 *
 * Nessun campo "piano": /api/admin/quotas restituisce i limiti ma non il nome
 * del piano, e una riga "Piano —" sarebbe rumore permanente. Verificato sulla
 * risposta vera, non sulla forma che mi aspettavo.
 */
interface Quote {
  pagine: { uso: number; limite: number }
  foto: { uso: number; limite: number }
  conversazioni: { uso: number; limite: number }
}

/**
 * Le poche scorciatoie che restano. Il menu esiste per navigare: qui stanno solo
 * le tre cose che si aprono davvero ogni giorno, e solo se la persona ha il
 * pannello corrispondente (quindi il permesso).
 */
const SCORCIATOIE: { label: string; href: string; richiedePannello: string }[] = [
  { label: "Vai alla casella", href: "/admin/inbox", richiedePannello: "backlog" },
  { label: "Telefonate", href: "/admin/calls", richiedePannello: "calls" },
  { label: "Le mie attività", href: "/admin/my-work", richiedePannello: "my-shifts" },
]

export default function AdminDashboardPage() {
  const [risposta, setRisposta] = useState<Risposta | null>(null)
  const [erroreCarico, setErroreCarico] = useState<string | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)

  useEffect(() => {
    let vivo = true

    async function carica() {
      try {
        const r = await fetch("/api/platform/dashboard")
        if (!r.ok) {
          // Un errore non si nasconde: senza questo messaggio la pagina
          // sembrerebbe semplicemente vuota, che e' peggio di un guasto visibile.
          setErroreCarico(
            r.status === 401
              ? "Sessione scaduta: rientra per vedere il cruscotto."
              : `Non è stato possibile leggere i dati (errore ${r.status}).`,
          )
          return
        }
        const j = (await r.json()) as Risposta
        if (vivo) setRisposta(j)
      } catch {
        if (vivo) setErroreCarico("Non è stato possibile contattare il servizio.")
      }
    }

    async function caricaQuote() {
      try {
        const r = await fetch("/api/admin/quotas")
        if (!r.ok) return
        const d = await r.json()
        // getQuotaStatus risponde {quotas, usage, ...}: si leggono i conteggi
        // reali. Una versione precedente leggeva una forma inesistente e
        // "Utilizzo risorse" mostrava sempre 0 su 0.
        if (d?.usage && d?.quotas && vivo) {
          setQuote({
            pagine: { uso: d.usage.pagesCount ?? 0, limite: d.quotas.maxPagesCount ?? 0 },
            foto: { uso: d.usage.photosCount ?? 0, limite: d.quotas.maxPhotosCount ?? 0 },
            conversazioni: {
              uso: d.usage.conversationsThisMonth ?? 0,
              limite: d.quotas.maxConversationsPerMonth ?? 0,
            },
          })
        }
      } catch {
        // Le quote sono un contorno: se non arrivano il cruscotto resta utile.
      }
    }

    carica()
    caricaQuote()
    return () => {
      vivo = false
    }
  }, [])

  if (erroreCarico) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div>
            <h2 className="text-sm font-medium text-foreground">Cruscotto non disponibile</h2>
            <p className="mt-1 text-sm text-muted-foreground">{erroreCarico}</p>
          </div>
        </div>
      </main>
    )
  }

  if (!risposta) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
        <div className="h-7 w-52 animate-pulse rounded bg-muted" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <span className="sr-only">Caricamento del cruscotto</span>
      </main>
    )
  }

  const visibili = new Set(risposta.panels)
  const pannelli = DASHBOARD_PANELS.filter((p) => visibili.has(p.id))
  const scorciatoie = SCORCIATOIE.filter((s) => visibili.has(s.richiedePannello))

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Cruscotto {risposta.profilo}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground text-balance md:text-3xl">
          Cosa sta succedendo adesso
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">
          Vedi soltanto le sezioni che i tuoi permessi ti concedono: quello che manca non è nascosto
          per errore.
        </p>
      </header>

      {/*
        Vista d'insieme su tutti i clienti, per chi amministra la piattaforma.
        Prima era una pagina separata (/super-admin) con una sua intestazione e
        un suo menu: due cruscotti gemelli da tenere allineati a mano.

        Si guarda `isPlatformAdmin` e NON `isAdmin`, che comprende anche
        l'amministratore di una singola struttura: confonderli mostrerebbe a un
        albergatore il fatturato della piattaforma e i suoi concorrenti. Il campo
        arriva dal server, gia' deciso.

        Sta in cima perche' e' lo sguardo piu' ampio: sotto, gli stessi occhi
        trovano i numeri della struttura su cui stanno lavorando.
      */}
      {risposta.isPlatformAdmin && <PlatformOverviewPanel />}

      {pannelli.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Nessun pannello disponibile con i permessi attuali. Chiedi a chi amministra la struttura
          di concederti le aree che ti servono.
        </p>
      ) : (
        PANEL_ORDER.map((kind: PanelKind) => {
          const gruppo = pannelli.filter((p) => p.kind === kind)
          if (gruppo.length === 0) return null
          return (
            <section key={kind} className="mb-10">
              <h2 className="mb-3 text-sm font-medium text-foreground">{PANEL_KIND_LABEL[kind]}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {gruppo.map((panel) => (
                  <DashboardCard key={panel.id} panel={panel} dati={risposta.dati} />
                ))}
              </div>
            </section>
          )
        })
      )}

      {/* Utilizzo risorse: solo per chi amministra, e solo se i limiti esistono. */}
      {risposta.isAdmin && quote && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-medium text-foreground">Utilizzo risorse</h2>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-col gap-4">
              {[
                { nome: "Pagine", v: quote.pagine },
                { nome: "Foto", v: quote.foto },
                { nome: "Conversazioni del mese", v: quote.conversazioni },
              ].map(({ nome, v }) => (
                <div key={nome}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="text-sm text-muted-foreground">{nome}</span>
                    <span className="text-sm font-medium tabular-nums text-foreground">
                      {v.uso.toLocaleString("it-IT")}
                      {v.limite > 0 && ` / ${v.limite.toLocaleString("it-IT")}`}
                    </span>
                  </div>
                  {v.limite > 0 && (
                    <Progress value={Math.min(100, Math.round((v.uso / v.limite) * 100))} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {scorciatoie.length > 0 && (
        <nav aria-label="Scorciatoie" className="flex flex-wrap gap-2">
          {scorciatoie.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-ha-brand/40 hover:text-ha-brand"
            >
              {s.label}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ))}
        </nav>
      )}
    </main>
  )
}
