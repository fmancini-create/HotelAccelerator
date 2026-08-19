/**
 * Controllo della collaborazione in inbox.
 *
 * Due cose vanno dimostrate, non affermate:
 *
 * 1) DUE OPERATORI NON POSSONO PRENDERE IN CARICO LO STESSO MESSAGGIO.
 *    La garanzia sta in un vincolo di unicita' del database, non in un
 *    "esiste gia'?" scritto in codice: due richieste che arrivano nello stesso
 *    istante superano entrambe un controllo del genere, perche' nessuna delle
 *    due ha ancora scritto quando l'altra guarda. Qui le richieste partono
 *    davvero insieme (Promise.all su connessioni distinte).
 *
 * 2) LA CRONOLOGIA NON SI PUO' RISCRIVERE.
 *    Le rotte usano la chiave di servizio, che scavalca le regole di riga:
 *    senza un presidio nel database "sola aggiunta" sarebbe solo una promessa
 *    scritta in un commento.
 *
 * Le prove girano sul database reale ma su bersagli finti con un prefisso
 * riconoscibile, e vengono ripulite alla fine: nessuna conversazione vera
 * viene toccata.
 */

import { createClient } from "@supabase/supabase-js"
import { scegliScadenza } from "../lib/inbox/lock-settings-core.ts"

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !KEY) {
  console.error("FALLITO: mancano le credenziali del database.")
  process.exit(1)
}

/** Prefisso dei bersagli di prova: rende la pulizia finale inequivocabile. */
const PREFISSO = "ZZCHECK-collab-"

let passate = 0
let fallite = 0

function verifica(descrizione, condizione, dettaglio = "") {
  if (condizione) {
    passate++
    console.log(`  ok   ${descrizione}`)
  } else {
    fallite++
    console.error(`  NO   ${descrizione}${dettaglio ? ` -> ${dettaglio}` : ""}`)
  }
}

// ---------------------------------------------------------------------------
// Parte 1: la regola di precedenza delle scadenze (logica pura)
// ---------------------------------------------------------------------------
function provaPrecedenzaScadenze() {
  console.log("\nPrecedenza delle scadenze (operatore > gruppo > struttura):")

  const UTENTE = "11111111-1111-1111-1111-111111111111"
  const GRUPPO_A = "22222222-2222-2222-2222-222222222222"
  const GRUPPO_B = "33333333-3333-3333-3333-333333333333"
  const ALTRO_GRUPPO = "44444444-4444-4444-4444-444444444444"

  const righe = [
    { group_id: null, user_id: null, idle_seconds: 300 },
    { group_id: GRUPPO_A, user_id: null, idle_seconds: 600 },
    { group_id: GRUPPO_B, user_id: null, idle_seconds: 900 },
    { group_id: null, user_id: UTENTE, idle_seconds: 120 },
  ]

  // La decisione sull'operatore vince anche quando e' piu' corta di quella dei
  // suoi gruppi: e' una scelta esplicita su di lui.
  const a = scegliScadenza(righe, UTENTE, [GRUPPO_A, GRUPPO_B], 180)
  verifica("la decisione sull'operatore vince sui gruppi", a.secondi === 120 && a.origine === "operatore", JSON.stringify(a))

  // Senza riga sull'operatore vince il gruppo, e fra due gruppi il piu' lungo.
  const senzaRigaUtente = righe.filter((r) => r.user_id === null)
  const b = scegliScadenza(senzaRigaUtente, UTENTE, [GRUPPO_A, GRUPPO_B], 180)
  verifica("fra due gruppi vince il valore piu' lungo", b.secondi === 900 && b.origine === "gruppo", JSON.stringify(b))

  // Un gruppo a cui l'operatore NON appartiene non lo riguarda: senza questo
  // caso il controllo passerebbe anche se le appartenenze fossero ignorate.
  const c = scegliScadenza(senzaRigaUtente, UTENTE, [ALTRO_GRUPPO], 180)
  verifica("un gruppo non suo non lo riguarda (scende a struttura)", c.secondi === 300 && c.origine === "struttura", JSON.stringify(c))

  // Nessuna impostazione: valore di fabbrica passato da chi legge il database.
  const d = scegliScadenza([], UTENTE, [], 180)
  verifica("senza impostazioni vale il valore di fabbrica", d.secondi === 180 && d.origine === "predefinito", JSON.stringify(d))

  // Un operatore anonimo (super amministratore senza scheda) non deve pescare
  // la riga di un altro: senza questo caso un `null` combinerebbe per sbaglio.
  const e = scegliScadenza(righe, null, [], 180)
  verifica("operatore senza scheda non eredita la riga di un altro", e.secondi === 300 && e.origine === "struttura", JSON.stringify(e))
}

// ---------------------------------------------------------------------------
// Parte 2: due prese in carico simultanee sul database reale
// ---------------------------------------------------------------------------
async function provaSimultaneita(propertyId) {
  console.log("\nPresa in carico simultanea (database reale):")

  // Due client distinti: due connessioni separate, come due operatori.
  const uno = createClient(URL, KEY, { auth: { persistSession: false } })
  const due = createClient(URL, KEY, { auth: { persistSession: false } })

  const bersaglio = `${PREFISSO}${Date.now()}-a`
  const riga = (chi) => ({
    property_id: propertyId,
    target_kind: "conversation",
    target_key: bersaglio,
    holder_key: chi,
    holder_label: chi,
  })

  // Partono insieme: e' questo che un controllo scritto in codice non regge.
  const [ra, rb] = await Promise.all([
    uno.from("conversation_locks").insert(riga("operatore-uno")).select("id"),
    due.from("conversation_locks").insert(riga("operatore-due")).select("id"),
  ])

  const riuscite = [ra, rb].filter((r) => !r.error).length
  const respinte = [ra, rb].filter((r) => r.error?.code === "23505").length

  verifica(
    "di due prese in carico simultanee ne riesce esattamente una",
    riuscite === 1,
    `riuscite=${riuscite} (errori: ${[ra.error?.code, rb.error?.code].filter(Boolean).join(",") || "nessuno"})`,
  )
  verifica("la perdente e' respinta dal vincolo di unicita' del database", respinte === 1, `respinte=${respinte}`)

  // Contro-verifica: il vincolo deve valere sul singolo messaggio, non essere
  // un blocco generale. Senza questo caso, un impianto rotto che rifiuta
  // qualsiasi secondo blocco passerebbe la prova qui sopra.
  const altro = `${PREFISSO}${Date.now()}-b`
  const { error: erroreAltro } = await uno
    .from("conversation_locks")
    .insert({ ...riga("operatore-due"), target_key: altro })
  verifica("su un altro messaggio la presa in carico riesce", !erroreAltro, erroreAltro?.message ?? "")

  // Lo stesso messaggio su Gmail e' un bersaglio diverso: i due mondi non
  // devono ostacolarsi a vicenda.
  const { error: erroreGmail } = await uno
    .from("conversation_locks")
    .insert({ ...riga("operatore-due"), target_kind: "gmail_thread" })
  verifica("lo stesso codice su Gmail e' un bersaglio distinto", !erroreGmail, erroreGmail?.message ?? "")

  return uno
}

// ---------------------------------------------------------------------------
// Parte 3: la cronologia non si riscrive
// ---------------------------------------------------------------------------
async function provaCronologiaImmutabile(client, propertyId) {
  console.log("\nCronologia in sola aggiunta:")

  const bersaglio = `${PREFISSO}${Date.now()}-log`
  const { data, error } = await client
    .from("conversation_activity_log")
    .insert({
      property_id: propertyId,
      target_kind: "conversation",
      target_key: bersaglio,
      user_key: null,
      user_label: "prova",
      action: "lock_acquired",
      details: { prova: true },
    })
    .select("id")
    .single()

  verifica("una riga di cronologia si puo' aggiungere", !error && !!data?.id, error?.message ?? "")
  if (!data?.id) return

  const { error: erroreModifica } = await client
    .from("conversation_activity_log")
    .update({ action: "lock_released" })
    .eq("id", data.id)
  verifica("modificare una riga di cronologia e' rifiutato", !!erroreModifica, "nessun errore: la traccia era riscrivibile")

  const { error: erroreCancella } = await client.from("conversation_activity_log").delete().eq("id", data.id)
  verifica("cancellare una riga di cronologia e' rifiutato", !!erroreCancella, "nessun errore: la traccia era cancellabile")
}

// ---------------------------------------------------------------------------
async function main() {
  const client = createClient(URL, KEY, { auth: { persistSession: false } })

  const { data: struttura, error: erroreStruttura } = await client
    .from("properties")
    .select("id, name")
    .limit(1)
    .maybeSingle()

  if (erroreStruttura || !struttura) {
    console.error("FALLITO: nessuna struttura su cui provare.", erroreStruttura?.message ?? "")
    process.exit(1)
  }

  provaPrecedenzaScadenze()
  const usato = await provaSimultaneita(struttura.id)
  await provaCronologiaImmutabile(usato, struttura.id)

  // Pulizia: i bersagli di prova hanno un prefisso riconoscibile, quindi non
  // si rischia di toccare righe vere. La cronologia NON e' cancellabile per
  // costruzione (e' il punto della prova), percio' le sue righe di prova
  // restano: sono marcate dal prefisso e non appartengono a nessuna
  // conversazione reale.
  await usato.from("conversation_locks").delete().like("target_key", `${PREFISSO}%`)
  await usato.from("conversation_drafts").delete().like("target_key", `${PREFISSO}%`)

  const { count } = await usato
    .from("conversation_locks")
    .select("id", { count: "exact", head: true })
    .like("target_key", `${PREFISSO}%`)

  console.log(`\nResidui di prova nei blocchi: ${count ?? 0}`)
  console.log(`Esito: ${passate} verifiche superate, ${fallite} fallite.`)

  if (fallite > 0 || (count ?? 0) > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
