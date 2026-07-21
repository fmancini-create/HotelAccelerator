"use client"

/**
 * ExpediaKpiTab — Expedia Partner Central wrapper around OtaPlatformKpiTab.
 *
 * Mirrors BookingKpiTab but for Expedia:
 * - platform="expedia"
 * - Expedia Partner Central-specific intro + tutorial
 * - Accepts XLSX (Expedia's default export format) + PDF
 *
 * Like Booking, Expedia Partner Central does not expose a public API for
 * hotels; the only way to get KPI history is manual export + upload.
 *
 * Created 12/05/2026 (FASE 2 OTA generalization).
 */

import { AlertCircle, Info } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { OtaPlatformKpiTab } from "./ota-platform-kpi-tab"

export function ExpediaKpiTab({ hotelId }: { hotelId: string }) {
  return (
    <OtaPlatformKpiTab
      hotelId={hotelId}
      platform="expedia"
      platformLabel="Expedia"
      uploadCardTitle="Carica un report da Expedia Partner Central"
      uploadCardDescription={
        "Accetta PDF (formato attuale di 'Esporta come PDF'), file Excel (.xlsx) dei report piu' vecchi e screenshot (PNG/JPG) della dashboard 'Dati e informazioni'. L'AI riconosce automaticamente il tipo di report (traffico, produzione o misto) e popola le sezioni corrispondenti. Massimo 10 MB."
      }
      manualFormCardTitle="Inserimento manuale dei KPI"
      manualFormCardDescription="Copia dalla dashboard 'Dati e informazioni' di Expedia Partner Central i valori per il periodo corrente e per lo stesso periodo dell'anno scorso (attiva il confronto 'vs. anno scorso')."
      introContent={<ExpediaIntro />}
      tutorialContent={<ExpediaTutorial />}
    />
  )
}

function ExpediaIntro() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>KPI Expedia Partner Central</CardTitle>
        <CardDescription className="leading-relaxed">
          Expedia non espone API pubbliche per gli hotel singoli. I dati si prendono dalla
          sezione <b>Dati e informazioni</b> di Partner Central: le metriche di traffico si
          copiano dalle card della dashboard, mentre produzione e ricavi si scaricano dal
          <b> Sistema di reportistica per strutture partner</b> con &ldquo;Esporta come
          PDF&rdquo;. Registrandoli periodicamente la piattaforma costruisce lo storico, le
          tendenze e suggerisce i pesi corretti per l&apos;algoritmo K-Driven.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm leading-relaxed">
            Expedia ha rinnovato Partner Central: tutto parte dalla voce di menu{" "}
            <b>Dati e informazioni</b>. Ci sono <b>due fonti</b> di dati:
            <ul className="mt-2 ml-4 list-disc space-y-2">
              <li>
                <b>Traffico e visibilita&apos;</b> (entrate, tasso di conversione, visite
                della pagina, notti prenotate) &rarr; le card della dashboard{" "}
                <b>Dati e informazioni</b>. Qui <b>non</b> c&apos;e&apos; un pulsante di
                export: fai uno <b>screenshot</b> delle card e caricalo qui sotto (l&apos;AI
                lo legge), oppure copia i valori nel form di inserimento manuale.
              </li>
              <li>
                <b>Produzione</b> (notti, ricavi, ADR, breakdown mensile) &rarr; da{" "}
                <b>Dati e informazioni</b> apri il <b>Sistema di reportistica per strutture
                partner</b>, poi usa <b>&ldquo;Esporta come PDF&rdquo;</b> e carica il file
                qui sotto.
              </li>
            </ul>
            <p className="mt-3">
              Le due fonti si <b>completano</b>: caricando il PDF di produzione e lo
              screenshot (o i valori manuali) del traffico ottieni un quadro completo del
              periodo. L&apos;AI unisce i dati se i periodi coincidono.
            </p>
          </AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm leading-relaxed">
            <b>Attenzione a due cose:</b>
            <ul className="mt-2 ml-4 list-disc space-y-2">
              <li>
                La vecchia pagina <b>Performance</b> viene dismessa da Expedia il{" "}
                <b>15 luglio 2026</b>: non usarla piu&apos;, i dati sono ora in{" "}
                <b>Dati e informazioni</b>.
              </li>
              <li>
                Nel Sistema di reportistica <b>non</b> usare il tab &ldquo;Flash Report su
                base annua&rdquo;: mostra solo variazioni percentuali (es. &minus;3,34%),
                non i valori assoluti. Usa i tab <b>&ldquo;Soggiorni mensili&rdquo;</b> e{" "}
                <b>&ldquo;Produzione prenotazioni&rdquo;</b>, che riportano notti, ricavi e
                ADR in numeri.
              </li>
              <li>
                Attiva sempre il confronto <b>&ldquo;vs. anno scorso&rdquo;</b> per avere lo
                storico YoY.
              </li>
            </ul>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}

function ExpediaTutorial() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tutorial: come reperire i dati</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="performance">
            <AccordionTrigger>
              1 &mdash; Traffico e visibilita&apos; (entrate, conversione, visite, notti) &mdash; screenshot o inserimento manuale
            </AccordionTrigger>
            <AccordionContent className="space-y-3">
              <ol className="list-decimal list-inside text-sm space-y-2 ml-2 leading-relaxed">
                <li>
                  Accedi a{" "}
                  <a
                    href="https://apps.expediapartnercentral.com"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    expediapartnercentral.com
                  </a>{" "}
                  con le credenziali della struttura e seleziona l&apos;hotel corretto in
                  alto.
                </li>
                <li>
                  Nel menu a sinistra apri <b>Dati e informazioni</b>.
                </li>
                <li>
                  In alto attiva il confronto <b>&ldquo;vs. anno scorso&rdquo;</b>: ogni card
                  mostrera&apos; il valore attuale e la riga <i>&ldquo;Scorso anno&rdquo;</i>.
                  Per il periodo, se puoi, usa <b>&ldquo;Personalizza&rdquo;</b> e imposta un{" "}
                  <b>intervallo di date preciso</b> (evita &ldquo;ultimi 90 giorni&rdquo;, che
                  non ha date esatte).
                </li>
                <li>
                  <b>Modo veloce &mdash; screenshot:</b> fai una schermata delle card
                  (Entrate, Visite della pagina, Notti prenotate, ecc.) e caricala qui sotto
                  nel riquadro &ldquo;Carica report&rdquo;: l&apos;AI legge i numeri delle
                  card e i valori &ldquo;Scorso anno&rdquo;.
                </li>
                <li>
                  <b>In alternativa</b>, copia gli stessi valori nel form di inserimento
                  manuale piu&apos; in basso.
                </li>
              </ol>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs leading-relaxed">
                  Questa dashboard <b>non ha un pulsante di export</b>: usa lo screenshot o
                  l&apos;inserimento manuale. Verifica sempre che i numeri estratti dallo
                  screenshot coincidano con quelli a schermo. Se il periodo e&apos; relativo
                  (&ldquo;ultimi 90 giorni&rdquo;) l&apos;AI potrebbe non ricavare le date:
                  in quel caso usa il form manuale indicando il periodo.
                </AlertDescription>
              </Alert>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="production">
            <AccordionTrigger>
              2 &mdash; Produzione (notti, ricavi, ADR, breakdown mensile) &mdash; export PDF
            </AccordionTrigger>
            <AccordionContent className="space-y-3">
              <ol className="list-decimal list-inside text-sm space-y-2 ml-2 leading-relaxed">
                <li>
                  Sempre da <b>Dati e informazioni</b>, apri il{" "}
                  <b>Sistema di reportistica per strutture partner</b> (Partner Reporting
                  Suite).
                </li>
                <li>
                  Controlla in alto che la <b>Valuta</b> sia <b>EUR</b> e che nei{" "}
                  <b>Filtri</b> sia impostato il periodo desiderato.
                </li>
                <li>
                  Seleziona il tab <b>&ldquo;Soggiorni mensili&rdquo;</b> (per il breakdown
                  mese per mese) oppure <b>&ldquo;Produzione prenotazioni&rdquo;</b> (notti
                  attribuite alla data di prenotazione, in linea con Booking).
                </li>
                <li>
                  Quando esporti, se compare la scelta delle sezioni <b>seleziona solo il
                  tab che ti serve</b> &mdash; <b>NON</b> tutte le caselle. Un PDF con tutti
                  i tab insieme mescola dati reali, previsioni e concorrenza e rende
                  l&apos;estrazione automatica molto meno affidabile.
                </li>
                <li>
                  <b>Non</b> includere &ldquo;Flash Report su base annua&rdquo; (solo
                  percentuali) ne&apos; &ldquo;Produzione soggiorni futuri&rdquo; (sono
                  previsioni, non dati realizzati).
                </li>
                <li>
                  In alto a destra clicca <b>&ldquo;Esporta come PDF&rdquo;</b>.
                </li>
                <li>
                  Trascina il PDF nel riquadro &ldquo;Carica report&rdquo; qui sotto:
                  l&apos;AI estrae notti, ricavi, ADR ed eventuale breakdown mensile in circa
                  30 secondi.
                </li>
              </ol>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs leading-relaxed">
                  <b>Report Excel piu&apos; vecchi:</b> se hai ancora file <b>.xlsx</b>{" "}
                  scaricati in passato, puoi caricarli lo stesso &mdash; l&apos;AI li legge
                  come prima.
                </AlertDescription>
              </Alert>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs leading-relaxed">
                  <b>Verifica sempre i numeri estratti.</b> Nei PDF di Expedia le tabelle
                  possono uscire con le cifre attaccate: se i valori (ricavi, notti, ADR)
                  non corrispondono a quelli che vedi a schermo, correggili o usa
                  direttamente l&apos;<b>inserimento manuale</b>, che e&apos; la via piu&apos;
                  affidabile. Meglio un dato inserito a mano che un numero letto male.
                </AlertDescription>
              </Alert>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
}
