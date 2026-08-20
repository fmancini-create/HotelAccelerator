import { CrmCallPanel } from "@/components/crm/crm-call-panel"
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
 * IL PERMESSO E' LA PARTE DELICATA, E QUI C'ERA UN DIFETTO MIO. Il registro
 * richiede l'area "calls", questo spazio l'area "crm": due permessi DISTINTI, e
 * dei due membri con l'area CRM uno NON ha l'area Telefonate. Avevo quindi
 * valutato il permesso qui, con `evaluateAreaAccess("calls")`, per non mandarlo
 * contro una porta chiusa. Aprendo la pagina come quell'utente vero, il rimando
 * "Apri le Telefonate" compariva comunque, accanto al diniego dell'elenco:
 * due verdetti opposti sulla stessa domanda.
 *
 * Il motivo, misurato: in un componente server non c'e' una `request` da
 * passare, e senza `request` `getDevBypass` concede il bypass di sviluppo solo
 * perche' `NODE_ENV === "development"`, restituendo l'identita' finta
 * `dev@hotelaccelerator.local` con i poteri di super-admin. La pagina giudicava
 * un utente che non era quello collegato, mentre `/api/telephony/calls` — che
 * riceve la richiesta con i cookie — giudicava quello vero e negava.
 *
 * Percio' IL GIUDICE E' UNO SOLO: l'API. Richiede la stessa area "calls" della
 * pagina `/admin/calls`, quindi la sua risposta e' la prova diretta che quella
 * porta si apre, e non puo' divergere da una seconda valutazione. Diniego
 * dichiarato e rimando al registro completo vivono entrambi in
 * `CrmCallsRecent`, guidati da quell'unica risposta.
 *
 * La chiamata in uscita resta disponibile in ogni caso: il click-to-call
 * richiede l'area "crm", non "calls".
 */
export default async function CrmCallsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Telefonate</h1>
        <p className="text-muted-foreground text-pretty">
          Chiama un numero e consulta le ultime telefonate registrate dal centralino.
        </p>
      </div>

      <CrmCallPanel />

      <CrmCallsRecent />
    </div>
  )
}
