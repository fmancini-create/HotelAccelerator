/**
 * PAGINA-SONDA TEMPORANEA — da eliminare subito dopo la verifica.
 *
 * Serve per guardare nel browser il componente VERO della pipeline. Il guscio
 * /admin rimanda al login lato client (`/api/platform/me` risponde 401 senza
 * sessione), quindi non potrei vedere la pagina senza una sessione autenticata.
 *
 * La strada alternativa era generare un magic link e incollarne il token nella
 * conversazione: un token di accesso all'account vero del committente, scritto
 * in chiaro in una trascrizione, per guardare una tabella. Questa sonda importa
 * lo stesso componente e chiama la stessa API, quindi prova la stessa cosa senza
 * mettere in giro credenziali.
 *
 * Non è una copia del componente: è un import di quello vero. Una copia avrebbe
 * potuto passare la verifica mentre la pagina vera restava rotta.
 */
import CrmPipelinePage from "../admin/crm/pipeline/page"

export default function SondaPipeline() {
  return (
    <main className="mx-auto max-w-6xl p-6">
      <CrmPipelinePage />
    </main>
  )
}
