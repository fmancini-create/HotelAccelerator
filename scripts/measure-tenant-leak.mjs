/**
 * MISURA COMPORTAMENTALE dell'isolamento fra tenant, su tutte le tabelle.
 *
 * Idea: invece di inventare dati finti in 34 tabelle, uso i DATI VERI gia'
 * presenti (che appartengono tutti al tenant reale) e creo due membri
 * usa-e-getta:
 *
 *   - membro A : appartiene al tenant REALE   -> DEVE continuare a vedere
 *                (controllo positivo: se va a zero, ho rotto l'applicazione)
 *   - membro B : appartiene a un tenant NUOVO -> NON deve vedere nulla
 *                (se vede righe, sta leggendo i dati di un altro cliente)
 *
 * Cosi' la stessa esecuzione misura insieme la falla e la non-regressione.
 *
 * Le tabelle vuote sono dichiarate NON MISURABILI, non contate come successo:
 * uno zero su una tabella vuota non dimostra isolamento.
 *
 * Nessun dato di produzione viene modificato: solo letture, piu' un tenant e
 * due utenti temporanei rimossi alla fine e verificati in lettura.
 */
import { createClient } from "@supabase/supabase-js"

const URL_SB = process.env.SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

if (!URL_SB || !SERVICE || !ANON) {
  console.error("Variabili mancanti (SUPABASE_URL, SERVICE_ROLE, ANON).")
  process.exit(2)
}

const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false } })

const TABELLE = [
  "admin_users",
  "canned_responses",
  "categories",
  "channel_settings",
  "channel_user_assignments",
  "command_logs",
  "contact_date_requests",
  "contact_imports",
  "contact_segment_members",
  "contact_segments",
  "contact_stays",
  "contacts",
  "conversations",
  "email_campaign_recipients",
  "email_campaigns",
  "email_channel_assignments",
  "email_channels",
  "email_labels",
  "email_signature_assignments",
  "email_signatures",
  "embed_scripts",
  "events",
  "group_channel_permissions",
  "message_impressions",
  "message_rules",
  "message_templates",
  "messages",
  "messaging_channels",
  "photo_categories",
  "photo_category",
  "platform_collaborators",
  "pms_integrations",
  "user_channel_permissions",
  "user_group_members",
  "user_groups",
]

const marca = `zz-misura-${Date.now()}`
const creati = { propB: null, utenti: [] }

async function creaMembro(email, propertyId) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: `Pv-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    email_confirm: true,
  })
  if (error) throw new Error(`createUser ${email}: ${error.message}`)
  creati.utenti.push(data.user.id)

  const { error: errM } = await admin.from("admin_users").insert({
    id: data.user.id,
    email,
    name: "MISURA temporanea",
    role: "editor",
    property_id: propertyId,
    is_tenant_admin: false,
  })
  if (errM) throw new Error(`insert admin_users ${email}: ${errM.message}`)
  return data.user.id
}

/** Access token vero, senza conoscere la password. */
async function tokenPer(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email })
  if (error) throw new Error(`generateLink: ${error.message}`)
  const tok = new URL(data.properties.action_link).searchParams.get("token")
  const v = await fetch(`${URL_SB}/auth/v1/verify?token=${tok}&type=magiclink`, {
    headers: { apikey: ANON },
    redirect: "manual",
  })
  const at = new URLSearchParams((v.headers.get("location") || "").split("#")[1] || "").get("access_token")
  if (!at) throw new Error(`token non ottenuto per ${email}`)
  return at
}

/**
 * Quante righe vede questo token, e quante di quelle sono ALTRUI.
 *
 * La distinzione conta: su admin_users il membro B vede legittimamente la
 * PROPRIA riga. Contare le righe totali mi darebbe un falso allarme. Cio' che
 * misura la falla e' il numero di righe che NON appartengono al suo tenant.
 */
async function vede(token, tabella, propertyProprio) {
  const r = await fetch(`${URL_SB}/rest/v1/${tabella}?select=*&limit=2000`, {
    headers: { apikey: ANON, authorization: `Bearer ${token}` },
  })
  const testo = await r.text()
  if (!testo.startsWith("[")) return { errore: `${r.status} ${testo.slice(0, 50)}` }
  const righe = JSON.parse(testo)
  // Se la tabella NON ha property_id non posso confrontare il proprietario:
  // contare zero sarebbe un falso verde. In quel caso vale che tutti i dati
  // preesistenti appartengono al tenant reale, quindi QUALSIASI riga vista dal
  // membro estraneo e' altrui.
  const haProperty = righe.length > 0 && Object.hasOwn(righe[0], "property_id")
  const altrui = haProperty
    ? righe.filter((x) => x.property_id && x.property_id !== propertyProprio).length
    : righe.length
  return { righe: righe.length, altrui }
}

async function pulisci() {
  const esiti = []
  // PRIMA i privilegi: un super amministratore dimenticato in produzione
  // sarebbe piu' grave della falla che sto correggendo.
  const { error: errPC } = await admin.from("platform_collaborators").delete().like("email", "zz-misura-%")
  esiti.push(`super amministratori temporanei: ${errPC ? "ERRORE " + errPC.message : "rimossi"}`)

  for (const id of creati.utenti) {
    await admin.from("admin_users").delete().eq("id", id)
    const { error } = await admin.auth.admin.deleteUser(id)
    esiti.push(`utente ${id.slice(0, 8)}: ${error ? "ERRORE " + error.message : "rimosso"}`)
  }
  if (creati.propB) {
    const { error } = await admin.from("properties").delete().eq("id", creati.propB)
    esiti.push(`tenant B: ${error ? "ERRORE " + error.message : "rimosso"}`)
  }
  // Verifica IN LETTURA, non dichiarata.
  const { data: u } = await admin.auth.admin.listUsers()
  const residuiU = u.users.filter((x) => (x.email || "").startsWith("zz-misura-")).length
  const { data: p } = await admin.from("properties").select("id").like("slug", "zz-misura-%")
  const { data: pc } = await admin.from("platform_collaborators").select("id").like("email", "zz-misura-%")
  const { data: au } = await admin.from("admin_users").select("id").like("email", "zz-misura-%")
  console.log("\nPulizia: " + esiti.join(" | "))
  console.log(
    `Verifica in lettura -> utenti: ${residuiU}, tenant: ${p?.length ?? "?"}, ` +
      `super amministratori: ${pc?.length ?? "?"}, righe admin_users: ${au?.length ?? "?"}`,
  )
  if (residuiU > 0 || (p?.length ?? 0) > 0 || (pc?.length ?? 0) > 0 || (au?.length ?? 0) > 0) {
    console.error("RESIDUI PRESENTI: intervenire a mano.")
    process.exitCode = 1
  }
}

async function main() {
  try {
    const { data: propA, error: errA } = await admin
      .from("properties")
      .select("id,name")
      .order("created_at", { ascending: true })
      .limit(1)
      .single()
    if (errA) throw new Error(`tenant reale: ${errA.message}`)

    const { data: pB, error: errB } = await admin
      .from("properties")
      .insert({ name: "MISURA tenant B (temporaneo)", slug: marca, plan: "free" })
      .select("id")
      .single()
    if (errB) throw new Error(`creazione tenant B: ${errB.message}`)
    creati.propB = pB.id

    const emailA = `${marca}-a@example.invalid`
    const emailB = `${marca}-b@example.invalid`
    const emailS = `${marca}-s@example.invalid`
    await creaMembro(emailA, propA.id)
    await creaMembro(emailB, pB.id)

    // Terzo soggetto: SUPER AMMINISTRATORE usa-e-getta.
    // Serve un controllo positivo dedicato: platform_collaborators non
    // appartiene a nessun tenant, quindi lo zero di un editor NON prova nulla.
    // Se invece un super amministratore vede zero, ho chiuso l'utente fuori
    // dal proprio backend, ed e' un guasto grave che devo scoprire adesso.
    await creaMembro(emailS, propA.id)
    const { error: errS } = await admin
      .from("platform_collaborators")
      .insert({ email: emailS, name: "MISURA temporanea", role: "super_admin", is_active: true })
    if (errS) throw new Error(`insert platform_collaborators: ${errS.message}`)

    const tokenA = await tokenPer(emailA)
    const tokenB = await tokenPer(emailB)
    const tokenS = await tokenPer(emailS)

    console.log(`Tenant reale: ${propA.name}`)
    console.log(`Membro A appartiene al tenant reale | Membro B a un tenant nuovo\n`)
    console.log("tabella                          totale   vedeA   vedeB   esito")
    console.log("=".repeat(76))

    let perdite = 0
    let misurabili = 0
    let vuote = 0
    let regressioni = 0

    // Tabella di piattaforma: non ha property_id e non appartiene a un tenant.
    // Il suo controllo positivo e' il super amministratore, non l'editor.
    const DI_PIATTAFORMA = new Set(["platform_collaborators"])

    for (const t of TABELLE) {
      const { count } = await admin.from(t).select("*", { count: "exact", head: true })
      const totale = count ?? 0
      const a = await vede(tokenA, t, propA.id)
      const b = await vede(tokenB, t, pB.id)

      if (a.errore || b.errore) {
        console.log(`${t.padEnd(32)} ${String(totale).padStart(6)}   ${(a.errore || b.errore).slice(0, 30)}`)
        continue
      }

      let esito
      if (totale === 0) {
        esito = "vuota, non misurabile"
        vuote++
      } else if (DI_PIATTAFORMA.has(t)) {
        misurabili++
        const s = await vede(tokenS, t, null)
        if (b.righe > 0 || a.righe > 0) {
          esito = "PERDITA: la vede un non-super-amministratore"
          perdite++
        } else if ((s.righe ?? 0) === 0) {
          esito = "REGRESSIONE: nemmeno il super amministratore la vede"
          regressioni++
        } else {
          esito = `isolata (super amministratore vede ${s.righe})`
        }
      } else {
        misurabili++
        // Righe ALTRUI, non righe totali: su admin_users il membro B ha
        // legittimamente una riga propria.
        if (b.altrui > 0) {
          esito = "PERDITA: vede dati altrui"
          perdite++
        } else if (a.righe === 0) {
          esito = "REGRESSIONE: il tenant proprietario non vede piu'"
          regressioni++
        } else {
          esito = "isolata"
        }
      }
      console.log(
        `${t.padEnd(32)} ${String(totale).padStart(6)}  ${String(a.righe).padStart(6)}  ${String(b.righe).padStart(6)}   ${esito}`,
      )
    }

    console.log("=".repeat(76))
    console.log(`Tabelle misurabili (con dati): ${misurabili}   |   vuote, escluse: ${vuote}`)
    console.log(`PERDITE (membro estraneo legge): ${perdite}`)
    console.log(`REGRESSIONI (proprietario non legge piu'): ${regressioni}`)
    if (perdite === 0 && regressioni === 0 && misurabili > 0) {
      console.log("\nESITO: isolamento attivo su tutte le tabelle misurabili, applicazione intatta.")
    } else if (perdite > 0) {
      console.log("\nESITO: isolamento ASSENTE o parziale.")
    }
  } finally {
    await pulisci()
  }
}

main().catch((e) => {
  console.error("Errore:", e.message)
  process.exitCode = 1
})
