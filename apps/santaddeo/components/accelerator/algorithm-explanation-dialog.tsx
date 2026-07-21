"use client"

/**
 * Dialog di spiegazione dei due modelli di pricing dell'algoritmo Santaddeo.
 *
 * Creato il 02/05/2026: serve sia nella tabella prezzi (`/accelerator/pricing`)
 * che nella pagina di configurazione (`/accelerator/pricing/settings`) per
 * dare all'utente una guida chiara e SEMPRE accessibile sui due motori
 * disponibili (Base e K-driven). Il dialog evidenzia automaticamente quello
 * attualmente in uso sulla struttura tramite la prop `currentAlgorithm`.
 *
 * Tutto il testo qui dentro deve restare allineato a `lib/pricing/calculate-suggested-price.ts`,
 * `lib/pricing/k-variables-service.ts` e `lib/pricing/k-intensity.ts` (livelli
 * standard / preset dell'Intensificatore K). Quando cambia la pipeline, i pesi
 * di K o i preset di intensita', va aggiornato anche questo file (vedi Step 3 e
 * la sezione "Esempio numerico" della tab K-driven).
 */

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { BookOpen, Cpu, BarChart3, Info, CheckCircle2, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

type AlgorithmType = "basic" | "advanced"

interface AlgorithmExplanationDialogProps {
  /** Algoritmo attualmente attivo per la struttura. Ricevuto come prop dalla
   * pagina chiamante, non ricaricato qui per evitare doppi fetch e stati
   * potenzialmente disallineati con quello visualizzato nella stessa schermata. */
  currentAlgorithm: AlgorithmType
  /** Variante del trigger button. Default "outline" per integrarsi nelle
   * toolbar; usa "ghost" se vuoi un'icona piu' discreta. */
  triggerVariant?: "default" | "outline" | "ghost" | "secondary"
  /** Etichetta del trigger. Su pagine larghe va bene il testo lungo; sulle
   * toolbar con poco spazio passare "" per mostrare solo l'icona. */
  triggerLabel?: string
  /** Se true, aggiunge un padding leggero al trigger e usa size="sm".
   * Ottimo per inserirlo nelle toolbar pricing che hanno gia' altri pulsanti
   * piccoli (h-8). */
  compact?: boolean
  /** Classe extra sul trigger. Permette di aggiustare colore/spacing per
   * la pagina specifica senza dover esportare ulteriori varianti. */
  triggerClassName?: string
}

export function AlgorithmExplanationDialog({
  currentAlgorithm,
  triggerVariant = "outline",
  triggerLabel = "Come funziona?",
  compact = false,
  triggerClassName,
}: AlgorithmExplanationDialogProps) {
  const [open, setOpen] = useState(false)
  // L'utente di default vede la tab del proprio algoritmo attivo. Se cambia
  // tab manualmente la rispettiamo finche' il dialog resta aperto.
  const [tab, setTab] = useState<AlgorithmType>(currentAlgorithm)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        // Reset alla tab corrente ogni volta che il dialog viene riaperto:
        // se nel frattempo l'utente ha cambiato algoritmo nelle settings,
        // alla riapertura vediamo subito quello giusto.
        if (o) setTab(currentAlgorithm)
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={triggerVariant}
          size={compact ? "sm" : "default"}
          className={cn(
            "gap-1.5",
            compact && "h-8 text-xs",
            triggerClassName,
          )}
        >
          <BookOpen className={compact ? "h-3 w-3" : "h-4 w-4"} />
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-foreground" />
            Come funziona l&apos;algoritmo di pricing
          </DialogTitle>
          <DialogDescription>
            Santaddeo offre due motori di calcolo prezzi. Qui sotto trovi cosa
            fanno, come si differenziano e quale stai usando ora.
          </DialogDescription>
        </DialogHeader>

        {/* Banner che evidenzia l'algoritmo correntemente attivo */}
        <Alert className="bg-muted/50 border-border">
          <CheckCircle2 className="h-4 w-4 text-foreground" />
          <AlertDescription className="text-sm">
            Per questa struttura e&apos; attivo l&apos;algoritmo{" "}
            <span className="font-semibold text-foreground">
              {currentAlgorithm === "basic" ? "Base (Occupazione)" : "K-driven (Avanzato)"}
            </span>
            . Puoi cambiarlo da{" "}
            <span className="font-medium">Configurazione algoritmo</span>.
          </AlertDescription>
        </Alert>

        <Tabs value={tab} onValueChange={(v) => setTab(v as AlgorithmType)} className="mt-2">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="basic" className="gap-2">
              <Cpu className="h-3.5 w-3.5" />
              Base
              {currentAlgorithm === "basic" && (
                <Badge variant="secondary" className="text-[9px] h-4 px-1">attivo</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="advanced" className="gap-2">
              <BarChart3 className="h-3.5 w-3.5" />
              K-driven
              {currentAlgorithm === "advanced" && (
                <Badge variant="secondary" className="text-[9px] h-4 px-1">attivo</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ──────────────────────────────────────────────────────────
              ALGORITMO BASE
              ──────────────────────────────────────────────────────── */}
          <TabsContent value="basic" className="space-y-5 pt-4">
            <Section title="Cos'e' in una frase">
              <p>
                Il prezzo di una camera e&apos; funzione di <strong>quanto e&apos; gia&apos; piena
                la struttura</strong> per quel giorno. Niente meteo, niente eventi,
                niente storia: piu&apos; e&apos; pieno, piu&apos; il prezzo sale a scatti
                (le &quot;fasce&quot;).
              </p>
            </Section>

            <Section title="Come funziona, passo per passo">
              <Step n={1} title="Tariffa base">
                Definisci un prezzo di partenza per la <em>cella di riferimento</em>{" "}
                (camera + tariffa + occupanza, es. <em>Standard / B&amp;B / 2 pax</em>).
                Esempio: 100€.
              </Step>
              <Step n={2} title="Fasce di occupazione">
                Definisci dei range (es. 0–30%, 30–60%, 60–80%, 80–100%) e per
                ognuno un incremento fisso (es. +0%, +10%, +25%, +40%).
              </Step>
              <Step n={3} title="Lettura occupazione corrente">
                Per ogni notte il sistema legge dal PMS quante camere sono gia&apos;
                vendute e calcola la percentuale di occupazione attuale.
              </Step>
              <Step n={4} title="Applicazione">
                Determina la fascia attiva e moltiplica:
                <span className="block mt-1 font-mono text-xs bg-muted rounded px-2 py-1">
                  prezzo = tariffa_base × (1 + incremento_fascia)
                </span>
              </Step>
              <Step n={5} title="Aggiustamenti strutturali">
                Su questo prezzo &quot;orizzontale&quot; vengono poi applicate le
                differenze tra tipologie di camera (Deluxe vs Standard),
                occupanze (singola vs doppia) e tariffe (Be Safe, Non Refundable...).
              </Step>
            </Section>

            <Section title="Esempio numerico">
              <ul className="space-y-1 text-sm">
                <li>• Tariffa base: <strong>100€</strong></li>
                <li>• Occupazione attuale: <strong>65%</strong> → fascia 60–80% → <strong>+25%</strong></li>
                <li>• Prezzo Standard 2 pax: 100 × 1.25 = <strong>125€</strong></li>
                <li>• Aggiustamento Deluxe: +30% → <strong>162.50€</strong></li>
              </ul>
            </Section>

            <Section title="Cosa NON fa">
              <p>
                Non guarda meteo, eventi, lead time, andamento dell&apos;anno
                scorso, reputazione. E&apos; un modello pulito ma &quot;cieco&quot; alla
                domanda esterna: alza solo se la struttura si sta riempiendo.
              </p>
            </Section>

            <IdealFor>
              B&amp;B, hotel piccoli, strutture stagionali con domanda
              prevedibile, contesti dove preferisci semplicita&apos; e prevedibilita&apos;
              alla precisione massima.
            </IdealFor>
          </TabsContent>

          {/* ──────────────────────────────────────────────────────────
              ALGORITMO K-DRIVEN
              ──────────────────────────────────────────────────────── */}
          <TabsContent value="advanced" className="space-y-5 pt-4">
            <Section title="Cos'e' in una frase">
              <p>
                Stessa logica del Base (tariffa base + fasce + aggiustamenti
                strutturali), ma gli incrementi vengono <strong>modulati da un
                coefficiente K</strong> che misura la pressione complessiva del
                mercato per quel giorno (8+ variabili pesate).
              </p>
            </Section>

            <Section title="Come funziona, passo per passo">
              <Step n={1} title="Calcolo K (range −1 ... +1)">
                Una sola volta al giorno il sistema calcola K come{" "}
                <strong>media pesata</strong> di 8 variabili in scala 0–10:
                occupazione, lead time, giorno della settimana, booking pace,
                stagionalita&apos;, cancellazioni, meteo, reputazione. Tu decidi i
                pesi nelle impostazioni.
                <span className="block mt-1.5 text-xs text-muted-foreground">
                  K = 0 → mercato neutro · K = +1 → mercato bollente · K = −1 → mercato piatto
                </span>
              </Step>
              <Step n={2} title="Scenario madre (storico)">
                Confronto con lo stesso giorno dell&apos;anno scorso: se vendesti
                tanto → <em>amplifica</em> (×1.15), se vendesti poco →{" "}
                <em>smorza</em> (×0.5–0.8), se nella media → 1.0.
              </Step>
              <Step n={3} title="Pipeline di prezzo">
                Stessi step del Base (tariffa base → fascia → camera →
                occupanza → tariffa) MA gli incrementi delle fasce e il peso
                domanda di mercato vengono modulati da K, e in piu&apos; K puo&apos;
                muovere direttamente il prezzo base:
                <span className="block mt-1 font-mono text-xs bg-muted rounded px-2 py-1">
                  incrementi × scenarioModifier × (1 + K × kIncremento)
                  <br />
                  base × (1 + K × kBase)
                </span>
                <span className="block mt-1.5 text-xs text-muted-foreground">
                  <strong>kIncremento</strong> e <strong>kBase</strong> sono le due
                  leve dell&apos;<strong>Intensificatore K</strong>: kIncremento (storicamente
                  0,3 = ±30% sull&apos;incremento) e kBase (quota diretta sul prezzo base,
                  0 di default). Si impostano scegliendo un <strong>livello standard</strong>
                  (Standard, Lieve, Moderato, Deciso, Massimo) dal menù &quot;Intensificatore K&quot;,
                  valido per l&apos;intera struttura, per periodo o per singolo giorno.
                </span>
              </Step>
              <Step n={4} title="Last minute (opzionale)">
                A ridosso della data, se ci sono ancora camere invendute, il
                sistema puo&apos; abbassare K per rendere i prezzi piu&apos; aggressivi.
                I prezzi alti gia&apos; venduti restano protetti dalle politiche di
                cancellazione.
              </Step>
              <Step n={5} title="Clamp finale">
                Il prezzo viene limitato tra <code className="text-xs">bottom_rate</code>{" "}
                e <code className="text-xs">rack_rate</code> per non uscire mai dai
                limiti definiti.
              </Step>
            </Section>

            <Section title="Esempio numerico">
              <p className="text-sm mb-2">
                Tariffa base 100€, occupazione 65% (fascia +25%), scenario
                neutro (×1.0). Vediamo come K modula il prezzo:
              </p>
              <div className="grid gap-1.5 text-sm">
                <Row label="K = 0 (mercato neutro)" value="100 × (1 + 0.25 × 1.0) = 125.00€" />
                <Row label="K = +0.5 (alta stagione, sole, evento)" value="100 × (1 + 0.25 × 1.15) = 128.75€" highlight />
                <Row label="K = −0.5 (bassa, piove, no eventi)" value="100 × (1 + 0.25 × 0.85) = 121.25€" />
                <Row label="K = +1 (massima pressione)" value="100 × (1 + 0.25 × 1.30) = 132.50€" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                A parita&apos; di occupazione (65%), K oscilla il prezzo finale di
                circa ±5–7%. L&apos;effetto e&apos; voluto-misurato, non drastico.
                <br />
                <span className="text-muted-foreground/80">
                  Esempio calcolato sul livello <strong>Standard</strong> (kIncremento 0,3,
                  kBase 0). Con livelli piu&apos; alti (Lieve → Massimo) l&apos;impatto di K
                  cresce, perche&apos; inizia a muovere anche il prezzo base.
                </span>
              </p>
            </Section>

            <Section title="Le 8 variabili che alimentano K">
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <VarRow name="Occupazione" desc="quanto e' gia' pieno" />
                <VarRow name="Lead time" desc="giorni al check-in" />
                <VarRow name="Giorno settimana" desc="storico per dow" />
                <VarRow name="Booking pace" desc="vs anno scorso" />
                <VarRow name="Stagionalita'" desc="per periodo" />
                <VarRow name="Cancellazioni" desc="rate ultimi gg" />
                <VarRow name="Meteo" desc="14 giorni avanti" />
                <VarRow name="Reputazione" desc="OTA pesato 180gg" />
              </div>
            </Section>

            <IdealFor>
              Hotel urbani, strutture con eventi, hotel multi-canale con
              domanda variabile e stagionalita&apos; marcata, contesti dove vale la
              pena reagire al meteo, eventi e booking pace.
            </IdealFor>
          </TabsContent>
        </Tabs>

        {/* ──────────────────────────────────────────────────────────
            SEZIONE COMUNE: cosa vale per entrambi
            ──────────────────────────────────────────────────────── */}
        <div className="mt-2 pt-4 border-t">
          <h3 className="font-semibold text-sm flex items-center gap-1.5 mb-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            Cosa vale in entrambi i casi
          </h3>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <ArrowRight className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                <strong className="text-foreground">Override manuali</strong>:
                puoi sempre forzare un prezzo da griglia (drag-fill, bulk-fill,
                cella singola). L&apos;override prevale sull&apos;algoritmo.
              </span>
            </li>
            <li className="flex gap-2">
              <ArrowRight className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                <strong className="text-foreground">Limiti hard</strong>: il
                prezzo finale e&apos; sempre clampato tra <code className="text-xs">bottom_rate</code>{" "}
                e <code className="text-xs">rack_rate</code>. Le tariffe Non
                Refundable rispettano i loro <code className="text-xs">release_days</code>.
              </span>
            </li>
            <li className="flex gap-2">
              <ArrowRight className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                <strong className="text-foreground">Push al PMS</strong>: i
                prezzi calcolati vengono salvati in <code className="text-xs">pricing_grid</code>{" "}
                e — se l&apos;autopilot e&apos; attivo — pushati automaticamente al PMS
                quando cambiano. Altrimenti ricevi solo l&apos;email di notifica.
              </span>
            </li>
            <li className="flex gap-2">
              <ArrowRight className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                <strong className="text-foreground">Eventi locali</strong>:
                puoi marcare singole date in <em>hotel_events</em> con impatto
                low/medium/high. La variabile K Eventi locali (se attiva) o
                gli aggiustamenti per data del Base ne tengono conto.
              </span>
            </li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Helper sub-components per ridurre rumore nel JSX principale
// ──────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold text-foreground text-sm mb-2">{title}</h3>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-1">
        {children}
      </div>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-foreground text-background text-xs font-semibold flex items-center justify-center mt-0.5">
        {n}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-foreground text-sm">{title}</div>
        <div className="text-sm text-muted-foreground leading-relaxed mt-0.5">
          {children}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-1.5 rounded-md text-sm",
        highlight ? "bg-foreground/5 border border-foreground/10" : "bg-muted/40",
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs text-foreground">{value}</span>
    </div>
  )
}

function VarRow({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="flex items-baseline gap-1.5 px-2 py-1 rounded bg-muted/40">
      <span className="font-medium text-foreground">{name}</span>
      <span className="text-muted-foreground text-[11px]">— {desc}</span>
    </div>
  )
}

function IdealFor({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1">
        Ideale per
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
  )
}
