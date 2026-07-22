"use client"

/**
 * BookingKpiTab — Booking.com-specific wrapper around the generic OtaPlatformKpiTab.
 *
 * Historical note: this file used to contain the full 1100-line implementation.
 * It was refactored 12/05/2026 (FASE 2) into a generic parametric component
 * (`OtaPlatformKpiTab`) plus per-platform wrappers (this file + ExpediaKpiTab).
 *
 * This wrapper is responsible only for:
 *   - Setting `platform="booking_com"` + `platformLabel="Booking.com"`
 *   - Rendering the Booking.com-specific intro + tutorial slots (admin.booking.com
 *     dashboard, "Report sull'andamento" navigation, etc.)
 *
 * All data logic, form, upload, reminder and history live in OtaPlatformKpiTab.
 */

import Image from "next/image"
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

const RANKING_IMG =
  "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-o1QkU6YIemCHwKCIM9ijSvBF83WGVl.png"
const REPORT_IMG =
  "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-O4SWnxY9yMAyXEKneIfGJpTeqAOV4m.png"

export function BookingKpiTab({ hotelId }: { hotelId: string }) {
  return (
    <OtaPlatformKpiTab
      hotelId={hotelId}
      platform="booking_com"
      platformLabel="Booking.com"
      uploadCardTitle="Carica un PDF da Booking"
      uploadCardDescription={
        'Accetta sia il "Performance Report" (visite + prenotazioni) sia il "Report sull\'andamento" (notti + revenue + ADR + breakdown mensile). PDF max 10 MB. L\'AI riconosce automaticamente il formato.'
      }
      manualFormCardTitle="Inserimento manuale dei 3 KPI"
      manualFormCardDescription="Copia dalla Dashboard ranking i valori per il periodo e per lo stesso periodo dell'anno scorso."
      introContent={<BookingIntro />}
      tutorialContent={<BookingTutorial />}
    />
  )
}

function BookingIntro() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>KPI Extranet Booking.com</CardTitle>
        <CardDescription className="leading-relaxed">
          Booking.com non espone API pubbliche per gli hotel, ma la loro Extranet contiene
          metriche preziose. Questa sezione ti permette di registrarle periodicamente in modo
          semplice, cosi&apos; la piattaforma puo&apos; costruire lo storico, le tendenze e
          suggerire i pesi corretti per l&apos;algoritmo K-Driven.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm leading-relaxed">
            Su Booking.com ci sono <b>due fonti di dati</b> con due flussi diversi:
            <ul className="mt-2 ml-4 list-disc space-y-2">
              <li>
                <b>Visualizzazioni, prenotazioni e ranking</b> &rarr; sono nella{" "}
                <b>Dashboard ranking</b>. Questa pagina{" "}
                <b>non ha un bottone &ldquo;Scarica PDF&rdquo;</b>: inserisci i 3 numeri
                principali nel form manuale qui sotto (vedi tutorial step 1).
              </li>
              <li>
                <b>Notti, ricavi, ADR e confronto YoY</b> &rarr; sono nel{" "}
                <b>Report sull&apos;andamento</b>. Questa pagina <b>ha</b> un bottone
                &ldquo;Stampa questa pagina&rdquo; che genera un PDF: caricalo nello spazio
                upload e l&apos;AI estrae tutto in automatico (vedi tutorial step 2).
              </li>
            </ul>
            <p className="mt-3">
              I due flussi si <b>completano</b>: la Dashboard ranking ti da&apos; il traffico
              (numeratore e denominatore della conversione), il Report sull&apos;andamento ti
              da&apos; cosa hai effettivamente venduto. Insieme costruiscono lo storico
              completo.
            </p>
          </AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm leading-relaxed">
            <b>Non caricare</b> il PDF di &ldquo;Dashboard Analytics&rdquo; (la pagina
            riassuntiva con i grafici a torta su finestra di prenotazione e provenienza
            ospiti): contiene solo notti e ricavi senza visualizzazioni ne&apos; conversioni,
            e duplicherebbe i dati del Report sull&apos;andamento. Sono pagine diverse
            dell&apos;extranet con lo stesso URL pattern, controlla il titolo prima di
            scaricare.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}

function BookingTutorial() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tutorial: come reperire i dati</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="ranking">
            <AccordionTrigger>
              1 &mdash; Visualizzazioni e prenotazioni: form manuale (Dashboard ranking)
            </AccordionTrigger>
            <AccordionContent className="space-y-3">
              <p className="text-sm leading-relaxed">
                Questa pagina <b>non offre un download PDF ufficiale</b>: i numeri vanno
                copiati a mano nel form qui sotto. Sono solo 3 valori, ti prende meno di un
                minuto.
              </p>
              <ol className="list-decimal list-inside text-sm space-y-2 ml-2 leading-relaxed">
                <li>
                  Accedi a{" "}
                  <a
                    href="https://admin.booking.com"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    admin.booking.com
                  </a>{" "}
                  con le credenziali della struttura.
                </li>
                <li>
                  Apri il menu <b>&ldquo;Migliora la tua performance&rdquo;</b> in alto e
                  clicca su <b>Dashboard ranking</b>.
                </li>
                <li>
                  In testa alla pagina trovi tre numeri grandi (vedi immagine sotto):
                  <ul className="list-disc list-inside ml-5 mt-1 space-y-0.5">
                    <li>
                      <b>Visualizzazioni nei risultati di ricerca</b> &rarr; campo
                      &ldquo;Visualizzazioni ricerca&rdquo;
                    </li>
                    <li>
                      <b>Visualizzazioni della tua pagina</b> &rarr; campo
                      &ldquo;Visualizzazioni struttura&rdquo;
                    </li>
                    <li>
                      <b>Prenotazioni</b> &rarr; campo &ldquo;Prenotazioni&rdquo;
                    </li>
                  </ul>
                </li>
                <li>
                  Imposta <b>Periodo</b>: la pagina di Booking copre per default gli ultimi{" "}
                  <b>90 giorni</b>. Imposta nel form le stesse date.
                </li>
                <li>
                  Opzionale: copia anche <b>Punteggio nei risultati di ricerca</b> (es.
                  &ldquo;10 su 80&rdquo;) e la posizione vs competitor.
                </li>
                <li>Clicca Salva. I dati appaiono subito nello storico in fondo alla pagina.</li>
              </ol>
              <div className="rounded-md overflow-hidden border">
                <Image
                  src={RANKING_IMG}
                  alt="Dashboard ranking Booking.com"
                  width={1000}
                  height={560}
                  className="w-full h-auto"
                />
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="report">
            <AccordionTrigger>
              2 &mdash; Notti, ricavi e ADR: upload PDF (Report sull&apos;andamento)
            </AccordionTrigger>
            <AccordionContent className="space-y-3">
              <p className="text-sm leading-relaxed">
                Questa pagina <b>ha</b> un download PDF ufficiale. Caricalo qui sotto e
                l&apos;AI estrae notti, ricavi, ADR e il breakdown mensile con confronto YoY
                in 30 secondi.
              </p>
              <ol className="list-decimal list-inside text-sm space-y-2 ml-2 leading-relaxed">
                <li>
                  Sempre da{" "}
                  <a
                    href="https://admin.booking.com"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    admin.booking.com
                  </a>
                  , apri il menu <b>Analytics</b> e clicca <b>Report sull&apos;andamento</b>.
                </li>
                <li>
                  In alto a sinistra imposta <b>Periodo prenotazioni</b>: &ldquo;Ultimi 30
                  giorni&rdquo; (o 90/365) e <b>Confronto con</b>: &ldquo;Anno scorso&rdquo;
                  per il YoY automatico.
                </li>
                <li>
                  Clicca <b>&ldquo;Stampa questa pagina&rdquo;</b> in alto a destra.
                </li>
                <li>
                  In <b>Destinazione</b> seleziona <b>&ldquo;Salva come PDF&rdquo;</b>.
                </li>
                <li>Trascina il PDF nel riquadro &ldquo;Carica PDF&rdquo; qui sotto.</li>
              </ol>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs leading-relaxed">
                  <b>Suggerimento:</b> assicurati che il titolo del PDF sia esattamente
                  &ldquo;<b>Report sull&apos;andamento</b>&rdquo;. Se invece il titolo e&apos;
                  &ldquo;Dashboard Analytics&rdquo;, &ldquo;Statistiche&rdquo; o
                  &ldquo;Insights&rdquo;, e&apos; un&apos;altra pagina che non contiene
                  visualizzazioni e conversioni: <b>non caricarla</b>.
                </AlertDescription>
              </Alert>
              <div className="rounded-md overflow-hidden border">
                <Image
                  src={REPORT_IMG}
                  alt="Report sull'andamento Booking.com"
                  width={1000}
                  height={560}
                  className="w-full h-auto"
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
}
