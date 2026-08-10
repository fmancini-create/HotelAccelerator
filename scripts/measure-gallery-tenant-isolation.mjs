/**
 * Prova COMPORTAMENTALE delle rotte foto dell'area amministrativa.
 *
 * Risponde a due domande distinte, che vanno tenute separate:
 *   1. FUNZIONA per l'amministratore legittimo? (prima rispondeva SEMPRE 401,
 *      perche' chiamava auth.getUser() su un client di servizio che non legge
 *      i cookie: "sicura per caso, ma rotta")
 *   2. ISOLA fra tenant? (il ruolo di servizio scavalca RLS: l'isolamento
 *      esiste solo se e' scritto nella query)
 *
 * TRAPPOLE EVITATE, gia' costate errori in passato:
 *   - `Host: localhost` attiva getDevBypass e restituisce un SUPER
 *     AMMINISTRATORE: misurerebbe il bypass, non l'isolamento. Qui l'host e'
 *     sempre non locale.
 *   - `generateLink()` CREA l'utente se non esiste: mai usato. Solo
 *     `admin.createUser` con indirizzi usa-e-getta @example.invalid.
 *   - Un 500 non e' un diniego: il controllo positivo pretende 200 esatto e
 *     quello negativo un 401, non "qualcosa che non e' 200".
 *   - Nessun dato reale viene toccato: tenant, utenti e foto sono creati e
 *     distrutti qui, con pulizia VERIFICATA IN LETTURA.
 */

import { createClient } from "@supabase/supabase-js"
import { randomUUID } from "node:crypto"

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const CHIAVE_SERVIZIO = process.env.SUPABASE_SERVICE_ROLE_KEY
const CHIAVE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const PORTA = process.env.DEV_PORT || "3000"
const BASE = `http://localhost:${PORTA}`
const HOST_NON_LOCALE = "www.hotelaccelerator.com"

if (!URL_SUPABASE || !CHIAVE_SERVIZIO || !CHIAVE_ANON) {
  console.error("Variabili Supabase mancanti: impossibile misurare.")
  process.exit(1)
}

const admin = createClient(URL_SUPABASE, CHIAVE_SERVIZIO, { auth: { persistSession: false } })
const marca = randomUUID().slice(0, 8)
const nati = { proprieta: [], utenti: [], foto: [] }
const esiti = []

function verifica(nome, atteso, ottenuto, dettaglio = "") {
  const ok = atteso === ottenuto
  esiti.push({ nome, ok, atteso, ottenuto, dettaglio })
  console.log(`  ${ok ? "VERDE" : "ROSSO"}  ${nome}: atteso ${atteso}, ottenuto ${ottenuto} ${dettaglio}`)
  return ok
}

async function chiama(percorso, corpo, token) {
  // `fetch` di Node SCARTA l'intestazione `Host` e la riscrive a localhost:
  // cosi' getDevBypass scattava e OGNI chiamante (anche anonimo) diventava
  // super amministratore -> misura completamente falsata (200 ovunque).
  // `x-forwarded-host` viene letto PRIMA di `host` e non viene filtrato.
  const headers = {
    Host: HOST_NON_LOCALE,
    "x-forwarded-host": HOST_NON_LOCALE,
    "Content-Type": "application/json",
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const r = await fetch(`${BASE}${percorso}`, { method: "POST", headers, body: JSON.stringify(corpo) })
  return r.status
}

async function creaTenant(etichetta) {
  const id = randomUUID()
  const { error } = await admin.from("properties").insert({
    id,
    name: `PROVA ${etichetta} ${marca}`,
    slug: `prova-${etichetta}-${marca}`,
    is_active: true,
    // Il vincolo valid_plan ammette solo free/starter/professional/enterprise
    // e il valore predefinito non lo soddisfa: va indicato esplicitamente.
    plan: "free",
  })
  if (error) throw new Error(`creazione tenant ${etichetta}: ${error.message}`)
  nati.proprieta.push(id)
  return id
}

async function creaAmministratore(propertyId, etichetta) {
  const email = `prova-${etichetta}-${marca}@example.invalid`
  const password = `Pw-${randomUUID()}`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(`creazione utente ${etichetta}: ${error.message}`)
  nati.utenti.push(data.user.id)

  const { error: e2 } = await admin.from("admin_users").insert({
    id: data.user.id,
    email,
    name: `Prova ${etichetta}`,
    property_id: propertyId,
    role: "admin",
    is_tenant_admin: true,
  })
  if (e2) throw new Error(`riga admin_users ${etichetta}: ${e2.message}`)

  const anon = createClient(URL_SUPABASE, CHIAVE_ANON, { auth: { persistSession: false } })
  const { data: sessione, error: e3 } = await anon.auth.signInWithPassword({ email, password })
  if (e3 || !sessione.session) throw new Error(`accesso ${etichetta}: ${e3?.message}`)
  return { email, token: sessione.session.access_token }
}

async function creaFoto(propertyId, alt, url) {
  const id = randomUUID()
  const { error } = await admin.from("photos").insert({ id, property_id: propertyId, alt, url, is_published: false })
  if (error) throw new Error(`creazione foto: ${error.message}`)
  nati.foto.push(id)
  return id
}

async function pulisci() {
  console.log("\n--- pulizia ---")
  if (nati.foto.length) await admin.from("photos").delete().in("id", nati.foto)
  if (nati.utenti.length) await admin.from("admin_users").delete().in("id", nati.utenti)
  for (const u of nati.utenti) await admin.auth.admin.deleteUser(u).catch(() => {})
  if (nati.proprieta.length) await admin.from("properties").delete().in("id", nati.proprieta)

  // Verifica IN LETTURA: la pulizia va provata, non dichiarata.
  const { count: foto } = await admin
    .from("photos")
    .select("id", { count: "exact", head: true })
    .in("id", nati.foto.length ? nati.foto : [randomUUID()])
  const { count: righe } = await admin
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .in("id", nati.utenti.length ? nati.utenti : [randomUUID()])
  const { count: props } = await admin
    .from("properties")
    .select("id", { count: "exact", head: true })
    .in("id", nati.proprieta.length ? nati.proprieta : [randomUUID()])
  const { data: lista } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const residui = (lista?.users ?? []).filter((u) => u.email?.includes(marca)).length
  console.log(`  residui -> foto:${foto ?? "?"} admin_users:${righe ?? "?"} properties:${props ?? "?"} auth:${residui}`)
  return (foto ?? 0) + (righe ?? 0) + (props ?? 0) + residui === 0
}

async function main() {
  console.log(`Prova isolamento galleria (marca ${marca})\n`)

  const tenantA = await creaTenant("a")
  const tenantB = await creaTenant("b")
  const adminA = await creaAmministratore(tenantA, "a")
  const adminB = await creaAmministratore(tenantB, "b")
  const fotoA = await creaFoto(tenantA, "originale-A", "https://esempio.invalid/a.jpg")
  const fotoDaCancellare = await creaFoto(tenantA, "da-cancellare-A", "")

  console.log("\n--- controlli di validita' dello strumento ---")
  verifica(
    "rotta inesistente (negativo)",
    404,
    await chiama("/api/admin/non-esiste-xyz", {}, adminA.token),
  )
  verifica("update-photo SENZA credenziali", 401, await chiama("/api/admin/update-photo", { photoId: fotoA }, null))

  console.log("\n--- 1. FUNZIONA per l'amministratore legittimo? (prima: sempre 401) ---")
  verifica(
    "admin A modifica la PROPRIA foto",
    200,
    await chiama("/api/admin/update-photo", { photoId: fotoA, alt: "modificata-da-A", isPublished: false }, adminA.token),
  )
  const { data: dopoA } = await admin.from("photos").select("alt").eq("id", fotoA).single()
  verifica("la modifica e' stata scritta", true, dopoA?.alt === "modificata-da-A", `(alt="${dopoA?.alt}")`)

  console.log("\n--- 2. ISOLA fra tenant? ---")
  verifica(
    "admin B modifica la foto di A",
    404,
    await chiama("/api/admin/update-photo", { photoId: fotoA, alt: "RUBATA-DA-B", isPublished: true }, adminB.token),
  )
  const { data: dopoB } = await admin.from("photos").select("alt, is_published").eq("id", fotoA).single()
  verifica("la foto di A e' rimasta intatta", true, dopoB?.alt === "modificata-da-A" && dopoB?.is_published === false, `(alt="${dopoB?.alt}")`)

  verifica(
    "admin B cancella la foto di A",
    404,
    await chiama("/api/admin/delete-photo", { photoId: fotoDaCancellare }, adminB.token),
  )
  const { count: sopravvissuta } = await admin
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("id", fotoDaCancellare)
  verifica("la foto di A esiste ancora", 1, sopravvissuta ?? 0)

  console.log("\n--- 3. la cancellazione legittima funziona? ---")
  verifica(
    "admin A cancella la PROPRIA foto",
    200,
    await chiama("/api/admin/delete-photo", { photoId: fotoDaCancellare }, adminA.token),
  )
  const { count: rimasta } = await admin
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("id", fotoDaCancellare)
  verifica("la foto e' stata davvero cancellata", 0, rimasta ?? 1)

  const pulito = await pulisci()

  console.log("\n=== RIEPILOGO ===")
  const rossi = esiti.filter((e) => !e.ok)
  for (const r of rossi) console.log(`  ROSSO: ${r.nome} (atteso ${r.atteso}, ottenuto ${r.ottenuto}) ${r.dettaglio}`)
  console.log(`  ${esiti.length - rossi.length}/${esiti.length} verdi | pulizia ${pulito ? "verificata" : "INCOMPLETA"}`)
  if (rossi.length || !pulito) process.exitCode = 1
}

main().catch(async (e) => {
  console.error("ERRORE:", e.message)
  await pulisci().catch(() => {})
  process.exit(1)
})
