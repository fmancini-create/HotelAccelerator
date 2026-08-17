/**
 * Prova l'ANELLO COMPLETO di un conflitto, sui dati veri.
 *
 * Non basta che le regole calcolino un conflitto: il responsabile deve poterlo
 * chiudere e il dato del contatto deve cambiare DAVVERO. Qui si crea un
 * conflitto finto su un contatto vero, si preme "il PMS aveva ragione" e si
 * verifica che il telefono del contatto sia stato scritto.
 *
 * Tutto cio' che viene creato viene poi rimosso, e il valore originale del
 * contatto viene ripristinato.
 */

const BASE = "http://localhost:3000"

function env(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Servono SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY")
  return { url, key }
}

async function rest(path: string, init?: RequestInit) {
  const { url, key } = env()
  const r = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers ?? {}),
    },
  })
  const testo = await r.text()
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${testo.slice(0, 200)}`)
  return testo ? JSON.parse(testo) : null
}

let esiti = 0
let fallimenti = 0
function ok(nome: string, condizione: boolean, dettaglio = "") {
  esiti++
  if (!condizione) fallimenti++
  console.log(`  ${condizione ? "ok  " : "FAIL"}  ${nome}${dettaglio && !condizione ? ` -> ${dettaglio}` : ""}`)
}

async function main() {
  // Un contatto vero, con il suo telefono attuale da ripristinare a fine prova.
  const contatti = await rest("contacts?select=id,property_id,name,phone&limit=1")
  const c = contatti[0] as { id: string; property_id: string; name: string | null; phone: string | null }
  const telefonoOriginale = c.phone
  console.log(`\n== Anello del conflitto su un contatto vero ==`)
  console.log(`  contatto: ${c.name ?? "(senza nome)"} | telefono attuale: ${c.phone ?? "VUOTO"}`)

  const VALORE_PMS = "+39 333 0000001"
  let idConflitto: string | null = null

  try {
    const creato = await rest("contact_field_alternates", {
      method: "POST",
      body: JSON.stringify({
        property_id: c.property_id,
        contact_id: c.id,
        field: "phone",
        value: VALORE_PMS,
        current_value: telefonoOriginale,
        source: "pms",
      }),
    })
    idConflitto = creato[0].id as string
    ok("il conflitto viene registrato", Boolean(idConflitto))

    // Compare tra i conflitti aperti letti dalla pagina?
    const stato = await (await fetch(`${BASE}/api/crm/pms-sync`)).json()
    const trovato = (stato.conflitti ?? []).some((x: { id: string }) => x.id === idConflitto)
    ok("compare tra i conflitti aperti mostrati in pagina", trovato, JSON.stringify(stato.conflitti ?? []).slice(0, 150))

    // Il responsabile decide: "il valore del PMS era quello giusto".
    const r = await fetch(`${BASE}/api/crm/pms-sync`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: idConflitto, resolution: "promoted_alternate" }),
    })
    const esitoPatch = await r.json()
    ok("la decisione viene accettata", r.status === 200 && esitoPatch.ok === true, JSON.stringify(esitoPatch))

    // LA PROVA CHE CONTA: il telefono del contatto e' cambiato davvero?
    const dopo = await rest(`contacts?select=phone&id=eq.${c.id}`)
    ok(
      "il telefono del contatto e' stato scritto davvero",
      dopo[0].phone === VALORE_PMS,
      `atteso ${VALORE_PMS}, trovato ${dopo[0].phone}`,
    )

    // E il conflitto non deve piu' comparire tra quelli aperti.
    const stato2 = await (await fetch(`${BASE}/api/crm/pms-sync`)).json()
    const ancora = (stato2.conflitti ?? []).some((x: { id: string }) => x.id === idConflitto)
    ok("il conflitto risolto non compare piu' tra gli aperti", !ancora)
  } finally {
    // Ripristino: il contatto torna come era e la riga di prova viene rimossa.
    await rest(`contacts?id=eq.${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({ phone: telefonoOriginale }),
    })
    if (idConflitto) {
      await rest(`contact_field_alternates?id=eq.${idConflitto}`, { method: "DELETE" })
    }
    const verifica = await rest(`contacts?select=phone&id=eq.${c.id}`)
    const pulito = idConflitto ? await rest(`contact_field_alternates?select=id&id=eq.${idConflitto}`) : []
    console.log(`\n== Ripristino ==`)
    ok("il telefono del contatto e' tornato quello originale", verifica[0].phone === telefonoOriginale)
    ok("la riga di prova e' stata rimossa", pulito.length === 0)
  }

  console.log(`\n  ${esiti - fallimenti}/${esiti} verifiche superate`)
  if (fallimenti > 0) process.exit(1)
}

main().catch((e) => {
  console.error(`\n  ERRORE: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
