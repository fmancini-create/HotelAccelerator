import Link from "next/link"
import { ArrowRight, Lock, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CrmCallPanel } from "@/components/crm/crm-call-panel"
import { evaluateAreaAccess } from "@/lib/auth/area-access"
import { CrmCallsRecent } from "@/components/crm/crm-calls-recent"

/**
 * Telefonate nello spazio CRM.
 *
 * COSA C'ERA PRIMA: una tabella di tre chiamate inventate (nomi, numeri, esiti)
 * e quattro riquadri con "Durata media 03:26". Quel numero era il piu' dannoso
 * di tutti: `/api/telephony/calls` si RIFIUTA di calcolare una durata media, e
 * lo spiega nel proprio commento — per i gruppi di squillo `duration_seconds`
 * contiene il tempo di SQUILLO, non di conversazione, quindi mediarlo produce un
 * minutaggio che nessuno puo' interpretare. La pagina dimostrativa mostrava
 * esattamente la cifra che il codice vero considera inattendibile.
 *
 * PERCHE' NON UN SECONDO REGISTRO: `/admin/calls` esiste gia' e legge le
 * telefonate vere (251 in archivio) con filtri, ricerca per numero,
 * paginazione, esito dedotto e nomi degli interni — oltre 450 righe di
 * interfaccia. Ricostruirle qui avrebbe creato due registri destinati a
 * divergere al primo cambiamento. Questa pagina mostra le ultime telefonate e
 * rimanda la' per tutto il resto, come fa gia' `crm/contacts/page.tsx` con
 * l'elenco dei contatti.
 *
 * IL PERMESSO E' LA PARTE DELICATA. Il registro richiede l'area "calls", questo
 * spazio l'area "crm": sono due permessi DISTINTI, e la misura sul database dice
 * che dei due membri con l'area CRM uno NON ha l'area Telefonate. Per lui un
 * rimando secco sarebbe un vicolo cieco (`requireAreaPage("calls")` lo
 * rispedirebbe alla dashboard) e l'elenco qui sotto un 403 muto. Quindi si
 * VALUTA il permesso senza applicarlo — `evaluateAreaAccess` non lancia — e si
 * dichiara il motivo invece di mostrare una tabella vuota.
 *
 * La valutazione qui NON e' l'unica difesa: `evaluateAreaAccess` lascia passare
 * di proposito quando il database non risponde, ma i dati arrivano comunque da
 * `/api/telephony/calls`, che applica la propria guardia. Nel caso peggiore si
 * vede il riquadro con un errore, non le telefonate di chi non deve vederle.
 *
 * La chiamata in uscita resta disponibile in entrambi i casi: il click-to-call
 * richiede l'area "crm", non "calls".
 */
export default async function CrmCallsPage() {
  const accesso = await evaluateAreaAccess("calls")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Telefonate</h1>
        <p className="text-muted-foreground text-pretty">
          Chiama un numero e consulta le ultime telefonate registrate dal centralino.
        </p>
      </div>

      <CrmCallPanel />

      {accesso.allowed ? (
        <CrmCallsRecent />
      ) : (
        /* Diniego DICHIARATO: senza questo, l'elenco chiederebbe i dati e
           riceverebbe 403, mostrando "nessuna telefonata" — cioe' un archivio
           vuoto al posto di un permesso mancante. */
        <Card>
          <CardContent className="p-8 text-center">
            <Lock className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-foreground">Registro telefonate non accessibile</p>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground text-pretty leading-relaxed">
              Il tuo utente ha l&apos;area CRM ma non l&apos;area «Telefonate», che è un permesso a parte: chiedi a un
              amministratore di assegnartela. Puoi comunque avviare chiamate dal riquadro qui sopra.
            </p>
          </CardContent>
        </Card>
      )}

      {accesso.allowed && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="flex items-start gap-3">
              <Phone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-foreground">Registro completo</p>
                <p className="text-sm text-muted-foreground text-pretty leading-relaxed">
                  Filtri per esito e direzione, ricerca per numero, nomi degli interni e tutto lo storico.
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/calls">
                Apri le Telefonate
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
