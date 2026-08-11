/**
 * Misura: /api/admin/manubot/setup non deve piu' agire su una property FISSA.
 *
 * Prima della correzione la rotta cercava "villa-i-barronci" ignorando chi
 * chiamava: un amministratore di un tenant qualsiasi ne sovrascriveva le
 * credenziali Manubot e riceveva in risposta un api_token valido per quella
 * struttura. Qui si verifica che un admin usa-e-getta agisca SOLO sulla propria.
 *
 * SALVAGUARDIA: i campi Manubot della property reale vengono letti prima e
 * riletti dopo. Se cambiassero, lo script li ripristina e dichiara FALLITO.
 *
 * Soggetti usa-e-getta, rimossi a fine prova con verifica in lettura.
 */
import { createClient } from "@supabase/supabase-js"

const URL_SB = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const PORTA = process.env.DEV_PORT || 3000
const BASE = `http://localhost:${PORTA}`
// `fetch` di Node SCARTA l'intestazione `Host` e la riscrive a localhost:
// scatterebbe getDevBypass e OGNI chiamante diventerebbe super amministratore.
// `x-forwarded-host` viene letto prima di `host` e non viene filtrato.
const HOST = "www.hotelaccelerator.com"

if (!URL_SB || !SERVICE) {
  console.error("Mancano SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false } })
const marca = `qa${Date.now().toString(36)}`
const esiti = []
const ok = (n, p, d = "") => esiti.push({ n, p, d })

async function chiama(percorso, token) {
  const r = await fetch(`${BASE}${percorso}`, {
    method: "GET",
    headers: {
      Host: HOST,
      "x-forwarded-host": HOST,
      Authorization: `Bearer ${token}`,
    },
  })
  let corpo = null
  try {
    corpo = await r.json()
  } catch {}
  return { stato: r.status, corpo }
}

/** Fotografia dei campi Manubot di una property, per confronto prima/dopo. */
async function fotografa(propertyId) {
  const { data } = await admin
    .from("properties")
    .select("manubot_email, manubot_company_id, manubot_supabase_url, api_token, api_token_hash")
    .eq("id", propertyId)
    .maybeSingle()
  return data ? JSON.stringify(data) : null
}

let tenantQa = null
let utenteQa = null
let barronciId = null
let fotoPrima = null

try {
  // ── La property reale da NON toccare ────────────────────────────────────
  const { data: reale } = await admin
    .from("properties")
    .select("id, name")
    .or("slug.eq.villa-i-barronci,id.eq.c16ad260-2c34-4544-9909-5cd444773986")
    .limit(1)
    .maybeSingle()

  if (!reale) {
    console.error("Property reale non trovata: senza bersaglio la prova non dimostra nulla.")
    process.exit(1)
  }
  barronciId = reale.id
  fotoPrima = await fotografa(barronciId)
  console.log(`Property reale sotto osservazione: ${reale.name}`)

  // ── Tenant e amministratore usa-e-getta ─────────────────────────────────
  const { data: t, error: et } = await admin
    .from("properties")
    .insert({
      name: `PROVA manubot ${marca}`,
      slug: `prova-manubot-${marca}`,
      is_active: true,
      plan: "free",
    })
    .select("id")
    .single()
  if (et) throw new Error(`creazione tenant: ${et.message}`)
  tenantQa = t.id

  const email = `qa-manubot-${marca}@example.invalid`
  const password = `Qa!${marca}!${Math.random().toString(36).slice(2)}`
  const { data: u, error: eu } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (eu) throw new Error(`creazione utente: ${eu.message}`)
  utenteQa = u.user.id

  // Colonne reali di admin_users: la chiave e' `id` (= id dell'utente auth),
  // non esistono `user_id` ne' `is_active`.
  const { error: ea } = await admin.from("admin_users").insert({
    id: utenteQa,
    email,
    name: `Prova manubot ${marca}`,
    property_id: tenantQa,
    role: "admin",
    is_tenant_admin: true,
  })
  if (ea) throw new Error(`nomina admin: ${ea.message}`)

  // Sessione reale
  const pubblico = createClient(URL_SB, ANON, { auth: { persistSession: false } })
  const { data: sessione, error: es } = await pubblico.auth.signInWithPassword({ email, password })
  if (es) throw new Error(`login: ${es.message}`)
  const token = sessione.session.access_token

  // ── PROVA 1: l'anonimo non passa ────────────────────────────────────────
  const anonimo = await fetch(`${BASE}/api/admin/manubot/setup`, {
    headers: { Host: HOST, "x-forwarded-host": HOST },
  })
  ok("anonimo respinto", [401, 403].includes(anonimo.status), `stato ${anonimo.status}`)

  // ── PROVA 2: un admin altrui non puo' puntare alla property reale ───────
  const mirato = await chiama(`/api/admin/manubot/setup?property_id=${barronciId}`, token)
  ok(
    "admin altrui NON puo' indicare la property reale",
    mirato.stato === 403,
    `stato ${mirato.stato}`,
  )

  // ── PROVA 3: CONTROLLO POSITIVO ─────────────────────────────────────────
  // Senza questo, una rotta rotta per TUTTI sembrerebbe "sicura": e' l'errore
  // gia' commesso con le rotte foto (401 anche all'admin legittimo).
  const proprio = await chiama("/api/admin/manubot/setup", token)
  ok(
    "l'admin PUO' agire sulla propria struttura (non e' rotta per tutti)",
    proprio.stato !== 401 && proprio.stato !== 403,
    `stato ${proprio.stato}`,
  )

  // ── PROVA 4: la property reale e' rimasta intatta ───────────────────────
  const fotoDopo = await fotografa(barronciId)
  ok("credenziali della property reale invariate", fotoDopo === fotoPrima)

  if (fotoDopo !== fotoPrima) {
    console.error("\n!! La property reale e' stata modificata: tento il ripristino")
    const prima = JSON.parse(fotoPrima)
    await admin.from("properties").update(prima).eq("id", barronciId)
    const fotoRipristino = await fotografa(barronciId)
    console.error(fotoRipristino === fotoPrima ? "   ripristino RIUSCITO" : "   ripristino FALLITO")
  }
} catch (e) {
  console.error("\nErrore durante la prova:", e.message)
} finally {
  // ── Pulizia, con verifica in lettura ────────────────────────────────────
  if (utenteQa) {
    // La chiave e' `id`, non `user_id`: col nome sbagliato la riga restava.
    await admin.from("admin_users").delete().eq("id", utenteQa)
    await admin.auth.admin.deleteUser(utenteQa).catch(() => {})
  }
  if (tenantQa) await admin.from("properties").delete().eq("id", tenantQa)

  const { count: restaTenant } = await admin
    .from("properties")
    .select("id", { count: "exact", head: true })
    .like("slug", `prova-manubot-${marca}%`)
  const { count: restaAdmin } = await admin
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .like("email", `qa-manubot-${marca}%`)

  console.log("\n─── ESITI ───")
  let verdi = 0
  for (const e of esiti) {
    console.log(`  ${e.p ? "VERDE" : "ROSSO"}  ${e.n}${e.d ? ` — ${e.d}` : ""}`)
    if (e.p) verdi++
  }
  console.log(`\n  ${verdi}/${esiti.length} verdi`)
  console.log(`  pulizia: tenant residui=${restaTenant ?? "?"}, admin residui=${restaAdmin ?? "?"}`)
  process.exit(verdi === esiti.length && !restaTenant && !restaAdmin ? 0 : 1)
}
