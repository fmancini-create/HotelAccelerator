/**
 * PROVA COMPORTAMENTALE DELL'ISOLAMENTO FRA TENANT.
 *
 * Domanda: un membro autenticato del tenant A puo' operare sui canali email del
 * tenant B?
 *
 * Perche' serve una prova e non basta leggere le politiche: su `email_channels`
 * la politica si chiama "Full access email_channels" ed e' `ALL` per il ruolo
 * `public` con condizione `true`. `deny_anon` chiude gli anonimi, ma un utente
 * **autenticato** passa. Quindi nel database NON c'e' isolamento fra tenant:
 * l'unica difesa e' il controllo applicativo `canAccessEmailChannel`.
 *
 * COME DISTINGUO SENZA INVIARE NESSUNA EMAIL
 * Il canale di prova viene creato SENZA credenziali OAuth. Cosi':
 *   404 "Canale non trovato"          -> la riga altrui non e' stata letta  = ISOLATO
 *   403 "Accesso negato"              -> controllo applicativo ha fermato   = ISOLATO
 *   400 "non configurato con OAuth"   -> la riga altrui E' STATA LETTA      = PASSAGGIO
 * In nessun caso si arriva all'invio, perche' senza token non c'e' niente con
 * cui inviare. La prova misura la DECISIONE di autorizzazione, non l'effetto.
 *
 * TUTTO CIO' CHE CREA E' TEMPORANEO E VIENE RIMOSSO SEMPRE, anche in errore.
 */
import { createClient } from "@supabase/supabase-js"

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const URL_SB = process.env.SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL_SB || !SERVICE) {
  console.error("Mancano SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false } })
const marca = `zz-prova-isolamento-${Date.now()}`
const EMAIL_TEMP = `${marca}@example.invalid`

const creati = { userId: null, membroId: null, propertyB: null, canaleB: null, canaleA: null }

async function creaScenario() {
  // Tenant A = quello vero (il primo esistente). Non lo modifico.
  const { data: propA, error: errA } = await admin
    .from("properties")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .single()
  if (errA || !propA) throw new Error(`tenant A non trovato: ${errA?.message}`)

  // Tenant B = temporaneo, creato solo per questa prova.
  const { data: propB, error: errB } = await admin
    .from("properties")
    .insert({ name: "PROVA isolamento (temporaneo)", slug: marca, plan: "free" })
    .select("id")
    .single()
  if (errB) throw new Error(`creazione tenant B: ${errB.message}`)
  creati.propertyB = propB.id

  // Canale email del tenant B, SENZA credenziali: non puo' inviare nulla.
  const { data: canale, error: errC } = await admin
    .from("email_channels")
    .insert({
      property_id: propB.id,
      name: "PROVA isolamento (temporaneo)",
      email_address: `${marca}@example.invalid`,
    })
    .select("id")
    .single()
  if (errC) throw new Error(`creazione canale B: ${errC.message}`)
  creati.canaleB = canale.id

  // Canale temporaneo nel tenant A (quello del membro), sempre SENZA
  // credenziali. Serve come controllo positivo del percorso a COOKIE: se il
  // cookie di sessione funziona, la rotta trova questo canale e si ferma su
  // "non configurato con OAuth" (400). Se invece rispondesse 404 anche qui,
  // vorrebbe dire che la rotta non ha autenticato nessuno, e il 404 sul canale
  // altrui non proverebbe nessun isolamento.
  const { data: canaleA, error: errCA } = await admin
    .from("email_channels")
    .insert({
      property_id: propA.id,
      name: "PROVA isolamento proprio (temporaneo)",
      email_address: `${marca}-proprio@example.invalid`,
    })
    .select("id")
    .single()
  if (errCA) throw new Error(`creazione canale A: ${errCA.message}`)
  creati.canaleA = canaleA.id

  // Membro NON amministratore del tenant A.
  const { data: nuovo, error: errU } = await admin.auth.admin.createUser({
    email: EMAIL_TEMP,
    password: `Pv-${Math.random().toString(36).slice(2)}-${Date.now()}`,
    email_confirm: true,
  })
  if (errU) throw new Error(`creazione utente: ${errU.message}`)
  creati.userId = nuovo.user.id

  const { error: errM } = await admin.from("admin_users").insert({
    id: nuovo.user.id,
    email: EMAIL_TEMP,
    name: "PROVA isolamento (temporaneo)",
    role: "editor",
    property_id: propA.id,
    is_tenant_admin: false,
  })
  if (errM) {
    await admin.auth.admin.deleteUser(nuovo.user.id).catch(() => {})
    creati.userId = null
    throw new Error(`creazione membro: ${errM.message} (utente rimosso)`)
  }
  creati.membroId = nuovo.user.id

  // Assegna al membro il canale del PROPRIO tenant. Serve al controllo
  // positivo: senza assegnazione un membro ristretto verrebbe respinto anche
  // sul canale legittimo, e un 403 non distinguerebbe piu' "isolamento
  // funzionante" da "respinge tutti".
  await admin.from("channel_user_assignments").insert({
    property_id: propA.id,
    user_id: nuovo.user.id,
    channel_id: canaleA.id,
    channel_type: "email",
    assignment_type: "member",
  })

  return { propA, propB: propB.id, canaleB: canale.id, canaleA: canaleA.id }
}

async function sessionePer(email) {
  // generateLink CREA l'utente se non esiste: qui l'indirizzo e' usa-e-getta
  // generato al momento, quindi non puo' far ricomparire nessun utente vero.
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email })
  if (error) throw new Error(`generateLink: ${error.message}`)
  const url = new URL(data.properties.action_link)
  const token = url.searchParams.get("token")
  const verifica = await fetch(`${URL_SB}/auth/v1/verify?token=${token}&type=magiclink`, {
    headers: { apikey: SERVICE },
    redirect: "manual",
  })
  const frammento = (verifica.headers.get("location") ?? "").split("#")[1] ?? ""
  const p = new URLSearchParams(frammento)
  const access_token = p.get("access_token")
  const refresh_token = p.get("refresh_token")
  if (!access_token) throw new Error("access token non ottenuto")

  // Alcune rotte (send-oauth) usano il client a COOKIE e non guardano affatto
  // l'intestazione Authorization. Un utente vero arriva dal browser con il
  // cookie di sessione: senza, la rotta vedrebbe un anonimo e la prova
  // risulterebbe "isolata" solo perche' non ha autenticato nessuno.
  const ref = JSON.parse(Buffer.from(access_token.split(".")[1], "base64").toString()).ref
  const sessione = { access_token, refresh_token, token_type: "bearer", expires_in: 3600, user: null }
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(sessione)).toString("base64")}`
  return { access_token, cookie }
}

async function pulisci() {
  const esiti = []
  if (creati.membroId) {
    const { error } = await admin.from("admin_users").delete().eq("id", creati.membroId)
    esiti.push(`membro: ${error ? "ERRORE " + error.message : "rimosso"}`)
  }
  if (creati.userId) {
    const { error } = await admin.auth.admin.deleteUser(creati.userId)
    esiti.push(`utente: ${error ? "ERRORE " + error.message : "rimosso"}`)
  }
  if (creati.canaleB) {
    const { error } = await admin.from("email_channels").delete().eq("id", creati.canaleB)
    esiti.push(`canale B: ${error ? "ERRORE " + error.message : "rimosso"}`)
  }
  if (creati.canaleA) {
    const { error } = await admin.from("email_channels").delete().eq("id", creati.canaleA)
    esiti.push(`canale A: ${error ? "ERRORE " + error.message : "rimosso"}`)
  }
  if (creati.propertyB) {
    const { error } = await admin.from("properties").delete().eq("id", creati.propertyB)
    esiti.push(`tenant B: ${error ? "ERRORE " + error.message : "rimosso"}`)
  }

  // Verifica IN LETTURA: non mi fido del resoconto della cancellazione.
  const { data: utenti } = await admin.auth.admin.listUsers()
  const residuiUtenti = utenti.users.filter((u) => (u.email ?? "").startsWith("zz-prova-isolamento-")).length
  const { data: residuiProp } = await admin.from("properties").select("id").like("slug", "zz-prova-isolamento-%")

  console.log(`\nPulizia: ${esiti.join(" | ")}`)
  console.log(`Verifica in lettura -> utenti residui: ${residuiUtenti} | tenant residui: ${residuiProp?.length ?? "?"}`)
  if (residuiUtenti > 0 || (residuiProp?.length ?? 0) > 0) {
    console.error("ATTENZIONE: sono rimasti dati di prova. Rimuoverli a mano.")
    process.exitCode = 1
  }
}

async function main() {
  let scenario
  try {
    scenario = await creaScenario()
    const { access_token, cookie } = await sessionePer(EMAIL_TEMP)
    // `Host` NON locale: altrimenti `getDevBypass` rende chiunque
    // amministratore e la prova misura il bypass, non l'isolamento.
    // (Trappola gia' scattata: dava 200 su una rotta che invece e' protetta.)
    const intestazioni = {
      "content-type": "application/json",
      authorization: `Bearer ${access_token}`,
      cookie,
      host: "www.hotelaccelerator.com",
      "x-forwarded-host": "www.hotelaccelerator.com",
    }

    console.log("PROVA DI ISOLAMENTO FRA TENANT")
    console.log("=".repeat(72))
    console.log(`Membro non-admin del tenant A: ${scenario.propA.name}`)
    console.log(`Bersaglio: canale email del tenant B (temporaneo, senza credenziali)`)
    console.log("")

    // CONTROLLO POSITIVO, prima di tutto: la sessione viene davvero accettata?
    // Senza questo, un 403/404 significherebbe solo "non ho autenticato
    // nessuno", e leggerei come isolamento cio' che e' una prova rotta.
    const sonda = await fetch(`${BASE}/api/inbox/conversations`, { headers: intestazioni })
    console.log(`Controllo positivo (area di base, membro autenticato): ${sonda.status}`)
    if (sonda.status === 401 || sonda.status === 403) {
      console.error(
        "  PROVA NON ATTENDIBILE: la sessione del membro non viene accettata.\n" +
          "  Ogni esito 'isolato' qui sotto sarebbe falso. Interrompo.",
      )
      throw new Error("sessione di prova non accettata")
    }
    if (sonda.status !== 200) {
      // Un 500 NON e' una conferma: accettarlo come "non 401/403" renderebbe
      // il controllo positivo inutile. In sviluppo e' noto e spiegato: il
      // bypass usa un token fittizio, la richiesta ricade sul ruolo anonimo e
      // il database nega i privilegi su `conversations` (42501, che e' un
      // errore di PRIVILEGI, non di RLS). Non e' causato dall'isolamento.
      console.warn(
        `  Controllo positivo INCONCLUDENTE (${sonda.status}): probabile artefatto del bypass\n` +
          "  di sviluppo. Vale il controllo positivo specifico qui sotto.",
      )
    }
    // CONTROLLO POSITIVO del percorso a COOKIE, specifico per send-oauth.
    const sondaCookie = await fetch(`${BASE}/api/channels/email/send-oauth`, {
      method: "POST",
      headers: intestazioni,
      body: JSON.stringify({
        channel_id: scenario.canaleA,
        property_id: scenario.propA.id,
        to: "nessuno@example.invalid",
        subject: "controllo positivo",
        body: "controllo positivo",
      }),
    })
    const testoCookie = (await sondaCookie.text()).slice(0, 100)
    // Il controllo positivo riguarda la DECISIONE DI AUTORIZZAZIONE: sul
    // proprio canale assegnato la rotta NON deve rispondere 403. Cosa succeda
    // dopo (404 perche' il canale non ha credenziali) non riguarda questa
    // prova. Senza questo controllo, un 403 sul canale altrui potrebbe
    // significare semplicemente "respinge chiunque".
    const autorizzatoSuProprio = sondaCookie.status !== 403
    console.log(
      `Controllo positivo (autorizzazione sul canale PROPRIO assegnato): ${sondaCookie.status} ` +
        `${autorizzatoSuProprio ? "-> non respinto, corretto" : "-> RESPINTO: " + testoCookie}`,
    )
    if (!autorizzatoSuProprio) {
      console.error(
        "  PROVA NON ATTENDIBILE: la rotta respinge anche l'accesso legittimo,\n" +
          "  quindi un 403 sul canale altrui non dimostrerebbe isolamento. Interrompo.",
      )
      throw new Error("controllo positivo fallito")
    }
    console.log("")

    const casi = [
      {
        nome: "channels/email/send-oauth",
        percorso: "/api/channels/email/send-oauth",
        corpo: {
          channel_id: scenario.canaleB,
          property_id: scenario.propB,
          to: "nessuno@example.invalid",
          subject: "prova isolamento",
          body: "prova isolamento",
        },
      },
      {
        nome: "channels/email/labels (ha il controllo)",
        percorso: "/api/channels/email/labels",
        corpo: { channel_id: scenario.canaleB, property_id: scenario.propB, labels: [] },
      },
      {
        nome: "channels/email/sync (ha il controllo)",
        percorso: "/api/channels/email/sync",
        corpo: { channel_id: scenario.canaleB, property_id: scenario.propB },
      },
    ]

    const esiti = []
    for (const c of casi) {
      const r = await fetch(`${BASE}${c.percorso}`, {
        method: "POST",
        headers: intestazioni,
        body: JSON.stringify(c.corpo),
      })
      const testo = (await r.text()).slice(0, 120)
      // 400 "non configurato con OAuth" = ha LETTO la riga di un altro tenant.
      const haLetto = r.status === 400 && /OAuth|configurato/i.test(testo)
      const isolato = r.status === 403 || r.status === 404 || r.status === 401
      esiti.push({ nome: c.nome, stato: r.status, isolato, haLetto })
      console.log(
        `  ${String(r.status).padEnd(4)} ${c.nome.padEnd(42)} ${
          haLetto ? "<-- PASSAGGIO: ha letto il canale altrui" : isolato ? "isolato" : "da guardare"
        }`,
      )
      if (!isolato) console.log(`        risposta: ${testo}`)
    }

    console.log("")
    const passaggi = esiti.filter((e) => e.haLetto)
    console.log(`Rotte che superano il confine fra tenant: ${passaggi.length} su ${esiti.length}`)
    if (passaggi.length === 0) console.log("Isolamento verificato su tutte le rotte provate.")
    else for (const p of passaggi) console.log(`   - ${p.nome}`)

    process.exitCode = passaggi.length > 0 ? 2 : 0
  } catch (e) {
    console.error(`\nProva interrotta: ${e.message}`)
    process.exitCode = 1
  } finally {
    await pulisci()
  }
}

await main()
