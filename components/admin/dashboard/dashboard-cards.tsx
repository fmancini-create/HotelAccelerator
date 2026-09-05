"use client"

/**
 * Le card del cruscotto.
 *
 * Ogni card sa leggere il proprio pezzo del payload di /api/platform/dashboard e
 * sa distinguere tre stati che NON vanno confusi:
 *
 *  - un numero misurato            -> lo mostra;
 *  - `null` (misura non riuscita)  -> "non misurabile", in tono di allarme;
 *  - il modulo attivo ma vuoto     -> "nessun dato ancora", neutro, con invito.
 *
 * Il secondo e il terzo si somigliano a schermo ma dicono cose opposte: uno e'
 * un guasto, l'altro e' normalita'. Tenerli distinti e' il motivo per cui l'API
 * restituisce `null` invece di zero.
 */

import Link from "next/link"
import { ArrowUpRight, TriangleAlert } from "lucide-react"
import RevenueSummaryCard from "@/components/admin/revenue-summary-card"
import type { DashboardPanel } from "@/lib/platform/dashboard"

type Dati = Record<string, any>

function Numero({ valore, sospetto }: { valore: number | null | undefined; sospetto?: boolean }) {
  if (valore === null || valore === undefined) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-destructive">
        <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
        non misurabile
      </span>
    )
  }
  return <span className={sospetto ? "text-destructive" : "text-foreground"}>{valore.toLocaleString("it-IT")}</span>
}

function Guscio({ panel, children, vuoto, sensoZero }: { panel: DashboardPanel; children: React.ReactNode; vuoto?: boolean; sensoZero?: string }) {
  const corpo = (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-ha-brand/40">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-foreground">{panel.title}</h4>
        {panel.href && <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-ha-brand" aria-hidden />}
      </div>
      <div className="flex-1">
        {vuoto ? (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums text-foreground">0</span>
            <span className="text-sm text-muted-foreground">{sensoZero ?? "niente in sospeso"}</span>
          </div>
        ) : children}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground text-pretty">{panel.hint}</p>
    </div>
  )

  if (!panel.href) return corpo
  return <Link href={panel.href} className="group block h-full">{corpo}</Link>
}

function Voce({ label, valore, sospetto }: { label: string; valore: number | null | undefined; sospetto?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums"><Numero valore={valore} sospetto={sospetto} /></span>
    </div>
  )
}

export function DashboardCard({ panel, dati }: { panel: DashboardPanel; dati: Dati }) {
  const d = dati[panel.id] as Dati | undefined

  switch (panel.id) {
    case "my-performance":
      return (
        <Guscio panel={panel}>
          <p className="text-sm text-muted-foreground">
            Le performance personali sono mostrate nel riepilogo principale della dashboard utente.
          </p>
        </Guscio>
      )

    case "my-commercial-performance":
      return (
        <Guscio panel={panel}>
          <p className="text-sm text-muted-foreground">
            I risultati commerciali personali sono mostrati nel riepilogo dedicato della dashboard utente e richiedono accesso all'area CRM.
          </p>
        </Guscio>
      )

    case "backlog":
      return (
        <Guscio panel={panel}>
          <div className="mb-1 text-3xl font-semibold tabular-nums"><Numero valore={d?.nonLette} sospetto={(d?.nonLette ?? 0) > 0} /></div>
          <p className="mb-2 text-xs text-muted-foreground">non lette, ultimi {d?.giorni ?? 7} giorni</p>
          <Voce label="movimento 24h" valore={d?.ultime24h} />
          <Voce label="in tutto, con archivio" valore={d?.nonLetteArchivio} />
        </Guscio>
      )

    case "stale":
      return (
        <Guscio panel={panel}>
          <div className="text-3xl font-semibold tabular-nums"><Numero valore={d?.ferme} sospetto={(d?.ferme ?? 0) > 0} /></div>
          <p className="mb-2 text-xs text-muted-foreground">ferme da oltre {d?.soglieOre ?? 24}h, ultimi {d?.giorni ?? 7} giorni</p>
          <Voce label="in tutto, con archivio" valore={d?.fermeArchivio} />
        </Guscio>
      )

    case "leave-requests":
      return (
        <Guscio panel={panel} vuoto={d?.inAttesa === 0}>
          <div className="text-3xl font-semibold tabular-nums"><Numero valore={d?.inAttesa} sospetto={(d?.inAttesa ?? 0) > 0} /></div>
          <p className="text-xs text-muted-foreground">in attesa</p>
        </Guscio>
      )

    case "knowledge-gaps":
      return (
        <Guscio panel={panel} vuoto={d?.aperte === 0}>
          <div className="text-3xl font-semibold tabular-nums"><Numero valore={d?.aperte} /></div>
          <p className="text-xs text-muted-foreground">da coprire nelle basi</p>
        </Guscio>
      )

    case "my-shifts":
      return (
        <Guscio panel={panel} vuoto={d?.prossimi === 0} sensoZero="nessun turno pubblicato">
          <div className="text-3xl font-semibold tabular-nums"><Numero valore={d?.prossimi} /></div>
          <p className="text-xs text-muted-foreground">turni in arrivo</p>
        </Guscio>
      )

    case "my-todos":
      return (
        <Guscio panel={panel} vuoto={d?.totali === 0}>
          <div className="text-3xl font-semibold tabular-nums"><Numero valore={d?.aperte} /></div>
          <p className="text-xs text-muted-foreground">aperte su {d?.totali ?? 0} totali</p>
        </Guscio>
      )

    case "calls":
      return (
        <Guscio panel={panel} vuoto={d?.totali === 0}>
          <Voce label="ultimi 7 giorni" valore={d?.totali} />
          <Voce label="perse" valore={d?.perse} sospetto={(d?.perse ?? 0) > 0} />
          <Voce label="entranti" valore={d?.entranti} />
        </Guscio>
      )

    case "volumes":
      return (
        <Guscio panel={panel} vuoto={d?.nessunaInclusa === true} sensoZero="nessuna sorgente scelta per le statistiche">
          <Voce label="Email" valore={d?.email} />
          <Voce label="Chat" valore={d?.chat} />
          <Voce label="WhatsApp" valore={d?.whatsapp} />
          <Voce label="Telegram" valore={d?.telegram} />
          {typeof d?.escluse === "number" && d.escluse > 0 ? <p className="mt-2 text-xs text-muted-foreground">{d.escluse === 1 ? "1 sorgente esclusa" : `${d.escluse} sorgenti escluse`} dalle statistiche</p> : null}
        </Guscio>
      )

    case "visitors":
      return (
        <Guscio panel={panel} vuoto={d?.siti === 0 && d?.giorniDomanda === 0} sensoZero="tracciamento non configurato">
          <Voce label="siti tracciati" valore={d?.siti} />
          <Voce label="giorni di domanda" valore={d?.giorniDomanda} />
        </Guscio>
      )

    case "campaigns":
      return (
        <Guscio panel={panel} vuoto={d?.totali === 0} sensoZero="nessuna campagna inviata">
          <div className="text-3xl font-semibold tabular-nums"><Numero valore={d?.totali} /></div>
          <p className="text-xs text-muted-foreground">campagne</p>
        </Guscio>
      )

    case "per-person": {
      const persone = d?.persone as Array<{ nome: string; risposte: number }> | null | undefined
      return (
        <Guscio panel={panel}>
          {persone === null || persone === undefined ? <Numero valore={null} /> : persone.length === 0 ? <p className="text-sm text-muted-foreground">Nessuna risposta attribuita.</p> : (
            <div className="space-y-1">
              {persone.slice(0, 5).map((p) => <div key={p.nome} className="flex items-baseline justify-between gap-3"><span className="truncate text-sm text-foreground">{p.nome}</span><span className="text-sm font-semibold tabular-nums">{p.risposte}</span></div>)}
            </div>
          )}
          {typeof d?.totali === "number" && d.totali > 0 && <p className="mt-2 text-xs text-muted-foreground">{d.attribuite} di {d.totali} risposte con autore ({d.giorni}g)</p>}
        </Guscio>
      )
    }

    case "revenue":
      return <RevenueSummaryCard />

    case "presence": {
      const persone = d?.persone as Array<{ nome: string; ultimoSegnale: string }> | null | undefined
      return (
        <Guscio panel={panel}>
          {persone === null || persone === undefined ? <Numero valore={null} /> : persone.length === 0 ? <p className="text-sm text-muted-foreground">Nessuno collegato negli ultimi {d?.minuti ?? 5} minuti.</p> : (
            <div className="space-y-1">{persone.map((p) => <div key={p.nome + p.ultimoSegnale} className="flex items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full bg-ha-brand" aria-hidden /><span className="truncate text-sm text-foreground">{p.nome}</span></div>)}</div>
          )}
        </Guscio>
      )
    }

    case "system-health":
      return (
        <Guscio panel={panel}>
          <Voce label="caselle collegate" valore={d?.caselle} />
          <Voce label="moduli attivi" valore={d?.moduliAttivi} />
        </Guscio>
      )

    default:
      return null
  }
}