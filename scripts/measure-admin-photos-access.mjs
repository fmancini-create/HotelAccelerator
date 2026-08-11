/**
 * Prova di accesso su /api/admin/photos.
 *
 * Prima della correzione questa rotta era **anonima**: `isAuthenticated()`
 * restituiva sempre `true`. Misurato dal vivo: GET anonimo -> 200 con l'elenco
 * reale delle foto; DELETE accetta un URL qualsiasi.
 *
 * Qui si misura che:
 *   - l'anonimo sia respinto (401, MAI 200 e MAI 500)
 *   - un amministratore di struttura NON passi (403: i file su Blob non sono
 *     separati per struttura)
 *   - un SUPER amministratore passi ancora (controllo positivo: senza questo,
 *     una rotta rotta per tutti sembrerebbe "sicura" — errore gia' commesso
 *     tre volte sulle rotte foto)
 *
 * Soggetti usa-e-getta, rimossi a fine prova con verifica in lettura.
 * NESSUNA foto viene cancellata: si usano solo letture e un DELETE su un URL
 * inesistente.
 */
import { createClient } from "@supabase/supabase-js"

const URL_BASE = "http://localhost:3000"
const OSPITE = "www.hotelaccelerator.com"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !serviceKey || !anonKey) {
  console.error("Mancano le credenziali Supabase nell'ambiente.")
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const marca = Date.now().toString(36)
const esiti = []
let abortita = null
const daPulire = { utenti: [], tenant: [], collaboratori: [] }

function ok(nome, passata, dettaglio) {
  esiti.push({ nome, passata, dettaglio })
}

async function chiama(percorso, token, metodo = "GET", corpo = null) {
  const headers = {
    // `fetch` di Node SCARTA l'intestazione `Host` e la riscrive a localhost,
    // attivando il bypass di sviluppo che promuove chiunque a super
    // amministratore. `x-forwarded-host` viene letto per primo e non filtrato.
    "x-forwarded-host": OSPITE,
    "Content-Type": "application/json",
  }
  if (token) headers["Authorization"] = `Bearer ${token}`
  const res = await fetch(`${URL_BASE}${percorso}`, {
    method: metodo,
    headers,
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  let dati = null
  try {
    dati = await res.json()
  } catch {}
  return { stato: res.status, corpo: dati }
}

async function creaUtente(email) {
  const password = `Prova!${marca}${Math.random().toString(36).slice(2, 8)}`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw new Error(`creazione utente fallita: ${error.message}`)
  daPulire.utenti.push(data.user.id)

  const utente = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: sessione, error: errSess } = await utente.auth.signInWithPassword({ email, password })
  if (errSess) throw new Error(`accesso fallito: ${errSess.message}`)
  return { id: data.user.id, token: sessione.session.access_token }
}

try {
  // ── Soggetti usa-e-getta ──────────────────────────────────────────────────
  const { data: tenant, error: errT } = await admin
    .from("properties")
    .insert({ name: `Prova foto ${marca}`, slug: `prova-foto-${marca}` })
    .select("id")
    .single()
  if (errT) throw new Error(`creazione struttura fallita: ${errT.message}`)
  daPulire.tenant.push(tenant.id)

  // Amministratore di struttura (NON super)
  const emailAdmin = `qa-foto-admin-${marca}@example.invalid`
  const adminTenant = await creaUtente(emailAdmin)
  const { error: errAU } = await admin.from("admin_users").insert({
    id: adminTenant.id,
    email: emailAdmin,
    name: `Prova admin ${marca}`,
    property_id: tenant.id,
    role: "admin",
    is_tenant_admin: true,
  })
  if (errAU) throw new Error(`nomina admin fallita: ${errAU.message}`)

  // SUPER amministratore: si riconosce da platform_collaborators, non da admin_users
  const emailSuper = `qa-foto-super-${marca}@example.invalid`
  const superAdmin = await creaUtente(emailSuper)
  const { error: errPC } = await admin
    .from("platform_collaborators")
    .insert({ email: emailSuper, role: "super_admin", is_active: true })
  if (errPC) throw new Error(`nomina super admin fallita: ${errPC.message}`)
  daPulire.collaboratori.push(emailSuper)

  // ── PROVA 1-3: anonimo respinto su ogni verbo ─────────────────────────────
  for (const [metodo, corpo] of [
    ["GET", null],
    ["DELETE", { files: ["https://esempio.invalid/inesistente.jpg"] }],
    ["PATCH", { moves: [] }],
  ]) {
    const r = await chiama("/api/admin/photos", null, metodo, corpo)
    ok(
      `anonimo respinto su ${metodo}`,
      r.stato === 401 || r.stato === 403,
      `stato ${r.stato}${r.stato === 200 ? " — ACCESSO LIBERO" : ""}${r.stato === 500 ? " — 500: l'autorizzazione non ha deciso" : ""}`,
    )
  }

  // ── PROVA 4: l'anonimo non vede l'elenco dei file ─────────────────────────
  const anonGet = await chiama("/api/admin/photos", null)
  ok(
    "l'anonimo non riceve l'elenco dei file",
    !Array.isArray(anonGet.corpo?.files),
    anonGet.corpo?.files ? `ESPOSTI ${anonGet.corpo.files.length} file` : "nessun elenco",
  )

  // ── PROVA 5: admin di struttura respinto (file non separati per struttura) ─
  const rAdmin = await chiama("/api/admin/photos", adminTenant.token)
  ok(
    "admin di struttura respinto (403, non 500)",
    rAdmin.stato === 403,
    `stato ${rAdmin.stato}`,
  )

  // ── PROVA 6: CONTROLLO POSITIVO — il super admin passa ancora ─────────────
  // Senza questo, una rotta rotta per TUTTI sembrerebbe perfettamente sicura.
  const rSuper = await chiama("/api/admin/photos", superAdmin.token)
  ok(
    "CONTROLLO POSITIVO: il super admin accede (no 401/403/500)",
    ![401, 403, 500].includes(rSuper.stato),
    `stato ${rSuper.stato}${[401, 403].includes(rSuper.stato) ? " — rotta rotta anche per chi ha diritto" : ""}`,
  )

  // ── PROVA 7: e riceve davvero l'elenco ────────────────────────────────────
  ok(
    "il super admin riceve l'elenco dei file",
    Array.isArray(rSuper.corpo?.files),
    Array.isArray(rSuper.corpo?.files) ? `${rSuper.corpo.files.length} file` : "nessun elenco",
  )
} catch (e) {
  // L'errore NON va assorbito: senza questo lo script uscirebbe 0 (successo)
  // pur non avendo eseguito nulla.
  abortita = e.message
  console.error("\nErrore durante la prova:", e.message)
} finally {
  // ── Pulizia, poi VERIFICA in lettura ──────────────────────────────────────
  for (const email of daPulire.collaboratori) {
    await admin.from("platform_collaborators").delete().eq("email", email)
  }
  for (const id of daPulire.utenti) {
    await admin.from("admin_users").delete().eq("id", id)
    await admin.auth.admin.deleteUser(id).catch(() => {})
  }
  for (const id of daPulire.tenant) {
    await admin.from("properties").delete().eq("id", id)
  }

  const { count: restaTenant } = await admin
    .from("properties")
    .select("id", { count: "exact", head: true })
    .like("slug", `prova-foto-${marca}%`)
  const { count: restaAdmin } = await admin
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .like("email", `qa-foto-%${marca}%`)
  const { count: restaColl } = await admin
    .from("platform_collaborators")
    .select("email", { count: "exact", head: true })
    .like("email", `qa-foto-%${marca}%`)

  console.log("\n─── ESITI ───")
  let verdi = 0
  let rossi = 0
  for (const e of esiti) {
    console.log(`  ${e.passata ? "VERDE" : "ROSSO"}  ${e.nome}${e.dettaglio ? ` — ${e.dettaglio}` : ""}`)
    e.passata ? verdi++ : rossi++
  }
  console.log(`\n  ${verdi} verdi, ${rossi} rossi (su ${esiti.length})`)
  console.log(
    `  pulizia: strutture=${restaTenant ?? "?"}, admin=${restaAdmin ?? "?"}, collaboratori=${restaColl ?? "?"}`,
  )

  // Zero prove eseguite NON e' un successo.
  const PROVE_ATTESE = 7
  if (abortita) console.error(`\n  ESITO: FALLITA — interrotta (${abortita})`)
  else if (esiti.length < PROVE_ATTESE)
    console.error(`\n  ESITO: FALLITA — eseguite ${esiti.length}/${PROVE_ATTESE} prove`)

  const superata =
    !abortita &&
    esiti.length >= PROVE_ATTESE &&
    rossi === 0 &&
    !restaTenant &&
    !restaAdmin &&
    !restaColl
  process.exit(superata ? 0 : 1)
}
