/**
 * NON-REGRESSIONE: le 56 nuove chiamate a `requireAreaApi` NON devono
 * respingere chi ha diritto di passare.
 *
 * Perche' serve, separata dalla prova sul membro senza permessi: quella
 * dimostra che la guardia BLOCCA, questa che NON blocca troppo. Una guardia
 * sempre-rossa supererebbe la prima a pieni voti e renderebbe il prodotto
 * inutilizzabile. E' lo stesso motivo per cui la rotta delle foto, "sicura per
 * caso ma rotta", respingeva anche l'amministratore legittimo senza che
 * nessuna misura se ne accorgesse.
 *
 * Due soggetti, entrambi usa-e-getta:
 *  - un AMMINISTRATORE di struttura (`is_tenant_admin`): non e' filtrato per
 *    area, deve passare ovunque;
 *  - un MEMBRO con l'area "crm" CONCESSA: deve passare su crm e restare
 *    bloccato su cms, cosi' si vede che la guardia legge davvero le concessioni
 *    e non applica un si'/no uguale per tutti.
 *
 * Cosa NON prova: che ogni singola rotta faccia il suo mestiere. Prova che il
 * permesso di area non introduce dinieghi indebiti.
 */
import { createClient } from "@supabase/supabase-js"

const BASE = process.env.BASE_URL || "http://localhost:3000"
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error("Mancano SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.")
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
const marca = Date.now()
const EMAIL_ADMIN = `zz-prova-admin-aree-${marca}@example.invalid`
const EMAIL_MEMBRO = `zz-prova-membro-crm-${marca}@example.invalid`

// Numero minimo di prove: se il conteggio non lo raggiunge, l'esito e' FALLITO
// e non "verde". Senza questa soglia un errore di rete farebbe uscire lo
// script con zero prove eseguite e apparente successo.
const PROVE_ATTESE = 6

async function creaUtente(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: `Prova-${marca}-${Math.random().toString(36).slice(2)}`,
  })
  if (error) throw new Error(`createUser(${email}): ${error.message}`)
  return data.user.id
}

async function sessionePer(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email })
  if (error) throw new Error(`generateLink: ${error.message}`)
  const hashed = data?.properties?.hashed_token
  if (!hashed) throw new Error("nessun hashed_token restituito")

  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const pubblico = createClient(url, anon, { auth: { persistSession: false } })
  const { data: ver, error: errVer } = await pubblico.auth.verifyOtp({ type: "magiclink", token_hash: hashed })
  if (errVer) throw new Error(`verifyOtp: ${errVer.message}`)
  return ver.session ?? null
}

function cookieDiSessione(sessione) {
  const ref = (url.match(/https:\/\/([^.]+)\./) || [])[1]
  if (!ref) throw new Error("riferimento progetto non ricavabile")
  return `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(sessione), "utf8").toString("base64")}`
}

async function chiama(percorso, sessione) {
  const r = await fetch(`${BASE}${percorso}`, {
    headers: {
      authorization: `Bearer ${sessione.access_token}`,
      cookie: cookieDiSessione(sessione),
      // Host non locale: senza questo il bypass di sviluppo trasformerebbe
      // chiunque in super amministratore e la prova sarebbe verde a vuoto.
      host: "app.hotelaccelerator.com",
      "x-forwarded-host": "app.hotelaccelerator.com",
    },
  })
  return r.status
}

async function main() {
  console.log(`Server: ${BASE}`)

  const { data: struttura } = await admin
    .from("properties")
    .select("id, name")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()
  if (!struttura) throw new Error("nessuna struttura attiva su cui misurare")

  const idAdmin = await creaUtente(EMAIL_ADMIN)
  const idMembro = await creaUtente(EMAIL_MEMBRO)
  let rigaAdmin = null
  let rigaMembro = null
  let uscita = 0
  const esiti = []

  try {
    const { data: ra, error: errA } = await admin
      .from("admin_users")
      .insert({
        // `id` non ha valore predefinito: e' l'id dell'utente di
        // autenticazione. Letto dallo schema, non indovinato.
        id: idAdmin,
        email: EMAIL_ADMIN,
        name: "Prova admin aree",
        property_id: struttura.id,
        role: "admin",
        is_tenant_admin: true,
      })
      .select("id")
      .single()
    if (errA) throw new Error(`admin_users(admin): ${errA.message}`)
    rigaAdmin = ra.id

    const { data: rm, error: errM } = await admin
      .from("admin_users")
      .insert({
        id: idMembro,
        email: EMAIL_MEMBRO,
        name: "Prova membro crm",
        property_id: struttura.id,
        // I ruoli ammessi sono solo super_admin / admin / editor (letto dal
        // vincolo della tabella): "staff" veniva rifiutato.
        role: "editor",
        is_tenant_admin: false,
      })
      .select("id")
      .single()
    if (errM) throw new Error(`admin_users(membro): ${errM.message}`)
    rigaMembro = rm.id

    // Al membro si concede SOLO "crm".
    const { error: errP } = await admin
      .from("user_area_permissions")
      .insert({ user_id: rigaMembro, property_id: struttura.id, area_key: "crm", granted: true })
    if (errP) throw new Error(`user_area_permissions: ${errP.message}`)

    console.log(`Struttura: "${struttura.name}"`)
    console.log(`  amministratore  ${EMAIL_ADMIN}  (nessun filtro per area)`)
    console.log(`  membro          ${EMAIL_MEMBRO}  (concessa la sola area "crm")\n`)

    const sesA = await sessionePer(EMAIL_ADMIN)
    const sesM = await sessionePer(EMAIL_MEMBRO)
    if (!sesA || !sesM) throw new Error("sessione non ottenuta")

    // Controllo di validita' dello strumento, prima di ogni conclusione.
    const prova = await fetch(`${BASE}/api/platform/me`, {
      headers: {
        cookie: cookieDiSessione(sesA),
        host: "app.hotelaccelerator.com",
        "x-forwarded-host": "app.hotelaccelerator.com",
      },
    })
    if (prova.status === 401) {
      console.log("STRUMENTO NON VALIDO: cookie non accettato. Nessun esito dichiarato.")
      process.exitCode = 1
      return
    }

    const casi = [
      ["amministratore", sesA, "/api/admin/crm/contacts", "deve PASSARE", (s) => s !== 403],
      ["amministratore", sesA, "/api/cms/pages", "deve PASSARE", (s) => s !== 403],
      ["amministratore", sesA, "/api/admin/tracking/sites", "deve PASSARE", (s) => s !== 403],
      ["membro (crm concessa)", sesM, "/api/admin/crm/contacts", "deve PASSARE", (s) => s !== 403],
      ["membro (crm concessa)", sesM, "/api/cms/pages", "deve essere BLOCCATO", (s) => s === 403],
      ["membro (crm concessa)", sesM, "/api/admin/tracking/sites", "deve essere BLOCCATO", (s) => s === 403],
    ]

    for (const [chi, ses, percorso, atteso, ok] of casi) {
      const stato = await chiama(percorso, ses)
      const esito = ok(stato)
      esiti.push(esito)
      // Un 500 non e' mai un esito valido: significa che la rotta muore prima
      // di decidere, e "non e' 403" non deve valere come successo.
      const rotto = stato >= 500
      console.log(`  ${esito && !rotto ? "OK  " : "ROSSO"}  ${stato}  ${percorso}  [${chi}] ${atteso}`)
      if (!esito || rotto) uscita = 1
    }

    if (esiti.length < PROVE_ATTESE) {
      console.log(`\nFALLITO: eseguite ${esiti.length} prove su ${PROVE_ATTESE} attese.`)
      uscita = 1
    }
  } finally {
    if (rigaMembro) await admin.from("user_area_permissions").delete().eq("user_id", rigaMembro)
    if (rigaAdmin) await admin.from("admin_users").delete().eq("id", rigaAdmin)
    if (rigaMembro) await admin.from("admin_users").delete().eq("id", rigaMembro)
    await admin.auth.admin.deleteUser(idAdmin).catch(() => {})
    await admin.auth.admin.deleteUser(idMembro).catch(() => {})

    // La pulizia si VERIFICA in lettura: dichiararla non basta.
    const { count } = await admin
      .from("admin_users")
      .select("id", { count: "exact", head: true })
      .in("email", [EMAIL_ADMIN, EMAIL_MEMBRO])
    console.log(`\nPulizia: residui rimasti = ${count ?? "?"} (0 = corretto)`)
    if ((count ?? 0) > 0) uscita = 1
  }

  process.exitCode = uscita
}

main().catch((e) => {
  console.error(`FALLITO: ${e.message}`)
  process.exitCode = 1
})
