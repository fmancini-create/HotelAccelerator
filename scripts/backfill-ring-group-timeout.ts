/**
 * Riallinea le chiamate GIA' salvate che sono cadute su un gruppo di squillo.
 *
 * Usa la STESSA funzione dell'ingestione (`esitoGruppoSquillo`): se un giorno
 * la regola cambia, registro storico e chiamate nuove restano d'accordo per
 * costruzione, invece di divergere per una copia dimenticata qui.
 *
 * Non inventa il timeout: legge `no_answer_seconds` dall'etichetta dell'interno.
 * Se nessun interno lo dichiara, il programma non tocca nulla e lo dice.
 *
 *   pnpm test:ring-group        # prima le prove
 *   pnpm backfill:ring-group    # poi il riallineamento
 */
import { esitoGruppoSquillo, ESITO_DEDOTTO } from "../lib/telephony/ring-group"

const URL_BASE = process.env.SUPABASE_URL
const CHIAVE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL_BASE || !CHIAVE) {
  console.error("Mancano SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY nell'ambiente.")
  process.exit(1)
}

const intestazioni = {
  apikey: CHIAVE,
  Authorization: `Bearer ${CHIAVE}`,
  "Content-Type": "application/json",
}

async function leggi(percorso: string) {
  const risposta = await fetch(`${URL_BASE}/rest/v1/${percorso}`, { headers: intestazioni })
  const corpo = await risposta.json()
  if (!risposta.ok) throw new Error(`lettura ${percorso}: ${risposta.status} ${JSON.stringify(corpo)}`)
  return corpo as any[]
}

async function principale() {
  const etichette = await leggi("telephony_extension_labels?select=property_id,extension,kind,no_answer_seconds")
  const gruppi = etichette.filter((e) => e.kind === "group" && typeof e.no_answer_seconds === "number")

  if (gruppi.length === 0) {
    console.log("Nessun gruppo di squillo con timeout dichiarato: niente da riallineare.")
    console.log('Dichiaralo in "Dai un nome agli interni", indicando i secondi di squillo del gruppo.')
    return
  }

  console.log(`Gruppi di squillo dichiarati: ${gruppi.map((g) => `${g.extension} (${g.no_answer_seconds}s)`).join(", ")}`)

  let riclassificate = 0
  let lasciateStare = 0

  for (const gruppo of gruppi) {
    const chiamate = await leggi(
      `phone_calls?select=id,direction,status,provider_status,status_source,duration_seconds,counterpart_number` +
        `&property_id=eq.${gruppo.property_id}&extension=eq.${gruppo.extension}&limit=5000`,
    )

    for (const chiamata of chiamate) {
      // `provider_status` puo' essere vuoto sulle righe scritte prima della
      // migrazione: in quel caso l'esito salvato ERA quello del centralino.
      const dalCentralino = chiamata.provider_status ?? chiamata.status

      const esito = esitoGruppoSquillo({
        kindInterno: gruppo.kind,
        direction: chiamata.direction,
        status: dalCentralino,
        durataSecondi: chiamata.duration_seconds,
        timeoutSecondi: gruppo.no_answer_seconds,
      })

      if (!esito || chiamata.status === esito) {
        lasciateStare++
        continue
      }

      const risposta = await fetch(`${URL_BASE}/rest/v1/phone_calls?id=eq.${chiamata.id}`, {
        method: "PATCH",
        headers: intestazioni,
        body: JSON.stringify({
          status: esito,
          provider_status: dalCentralino,
          status_source: ESITO_DEDOTTO,
        }),
      })

      // Un errore per riga NON deve passare in silenzio: senza questo controllo
      // il programma stamperebbe "riallineate N" con zero righe cambiate.
      if (!risposta.ok) {
        throw new Error(`riga ${chiamata.id} non aggiornata: ${risposta.status} ${await risposta.text()}`)
      }

      riclassificate++
    }
  }

  console.log(`Riallineate: ${riclassificate}`)
  console.log(`Lasciate come erano: ${lasciateStare}`)
}

principale().catch((errore) => {
  console.error(errore instanceof Error ? errore.message : errore)
  process.exit(1)
})
