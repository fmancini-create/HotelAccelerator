#!/usr/bin/env node
/**
 * Prova END-TO-END della guardia di area, sul server in esecuzione.
 *
 * Non verifica il codice: verifica il COMPORTAMENTO. Crea una sessione vera e
 * chiama le API come farebbe un membro dal browser.
 *
 * Perche' serve: una logica corretta ma NON collegata al percorso reale delle
 * richieste darebbe le stesse prove verdi e zero protezione.
 *
 * PERCHE' SI CREA DA SOLA IL MEMBRO
 * Prima puntava a un utente reale (`pippomancio@gmail.com`). Quando
 * quell'utente e' stato cancellato la prova ha smesso di funzionare: una
 * verifica che dipende da un dato di produzione e' una verifica che prima o poi
 * muore in silenzio. Ora crea un membro usa-e-getta, lo usa e lo rimuove
 * SEMPRE, anche se qualcosa fallisce a meta'.
 *
 * Il membro temporaneo non riceve nessuna area: e' esattamente il caso che la
 * guardia deve respingere. Non gli viene inviata alcuna email.
 *
 * Include un CONTROLLO POSITIVO (aree di base che devono PASSARE): senza, non
 * si distingue una guardia che funziona da una che blocca tutto.
 */

import { createClient } from "@supabase/supabase-js"

const BASE = process.env.BASE_URL || "http://localhost:3000"
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Nome inequivocabile: se per un guasto dovesse sopravvivere alla pulizia, deve
// essere riconoscibile a colpo d'occhio come residuo di una prova.
const EMAIL_TEMP = `zz-prova-guardia-aree-${Date.now()}@example.invalid`

if (!url || !serviceKey) {
  console.error("Mancano SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.")
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

/** Crea l'utente di prova e la sua appartenenza, senza concedergli aree. */
async function creaMembroTemporaneo() {
  const { data: prop, error: errProp } = await admin
    .from("properties")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .single()
  if (errProp) throw new Error(`lettura struttura: ${errProp.message}`)

  const { data: creato, error: errUtente } = await admin.auth.admin.createUser({
    email: EMAIL_TEMP,
    email_confirm: true,
    password: `prova-${crypto.randomUUID()}`,
  })
  if (errUtente) throw new Error(`createUser: ${errUtente.message}`)
  const userId = creato.user.id

  const { error: errMembro } = await admin.from("admin_users").insert({
    id: userId,
    email: EMAIL_TEMP,
    name: "PROVA guardia aree (temporaneo)",
    role: "editor",
    property_id: prop.id,
    is_tenant_admin: false,
  })
  if (errMembro) {
    // Creazione fallita A META': l'account esiste gia'. Senza questo ripristino
    // resterebbe un utente orfano in produzione ogni volta che la prova rompe
    // qui, ed e' proprio il tipo di residuo che nessuno va piu' a cercare.
    await admin.auth.admin.deleteUser(userId).catch(() => {})
    throw new Error(`insert admin_users: ${errMembro.message} (account di prova rimosso)`)
  }

  return { userId, propertyId: prop.id, propertyName: prop.name }
}

/** Rimuove ogni traccia del membro temporaneo. Non lancia mai. */
async function rimuoviMembroTemporaneo(userId) {
  const esiti = []
  try {
    await admin.from("user_area_permissions").delete().eq("user_id", userId)
    await admin.from("channel_user_assignments").delete().eq("user_id", userId)
    await admin.from("admin_users").delete().eq("id", userId)
    esiti.push("appartenenza rimossa")
  } catch (e) {
    esiti.push(`ERRORE appartenenza: ${e.message}`)
  }
  try {
    await admin.auth.admin.deleteUser(userId)
    esiti.push("account rimosso")
  } catch (e) {
    esiti.push(`ERRORE account: ${e.message}`)
  }

  // Verifica indipendente: non mi fido dell'esito dichiarato dalle chiamate.
  const { data: resta } = await admin.from("admin_users").select("id").eq("id", userId)
  const { data: restaAuth } = await admin.auth.admin.getUserById(userId)
  const pulito = (resta ?? []).length === 0 && !restaAuth?.user
  console.log(`\nPulizia: ${esiti.join(", ")} -> ${pulito ? "verificata, nessun residuo" : "RESIDUI PRESENTI"}`)
  if (!pulito) {
    console.log(`  ATTENZIONE: rimuovere a mano l'utente ${EMAIL_TEMP} (${userId}).`)
  }
  return pulito
}

/**
 * Genera un access token valido, senza conoscere la password.
 *
 * ATTENZIONE, trappola vera gia' scattata: `generateLink` **CREA l'utente se
 * non esiste**. La versione precedente di questa prova puntava a un indirizzo
 * reale; dopo che quell'utente era stato cancellato, eseguirla lo ha
 * RESUSCITATO come guscio vuoto in produzione — un account che sembrava
 * sopravvissuto alla cancellazione, ma aveva id diverso e zero accessi.
 *
 * Per questo l'indirizzo usato qui e' generato al momento e usa e getta: cosi'
 * la prova non puo' far ricomparire nessun utente vero.
 */
async function tokenPer(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email })
  if (error) throw new Error(`generateLink: ${error.message}`)
  const hashed = data?.properties?.hashed_token
  if (!hashed) throw new Error("nessun hashed_token restituito")

  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const pubblico = createClient(url, anon, { auth: { persistSession: false } })
  const { data: ver, error: errVer } = await pubblico.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashed,
  })
  if (errVer) throw new Error(`verifyOtp: ${errVer.message}`)
  return ver.session?.access_token
}

async function chiama(percorso, token) {
  const r = await fetch(`${BASE}${percorso}`, {
    headers: {
      authorization: `Bearer ${token}`,
      // Host non-localhost: neutralizza il bypass di sviluppo, che altrimenti
      // restituirebbe un super admin fittizio e una misura verde e falsa.
      host: "app.hotelaccelerator.com",
      "x-forwarded-host": "app.hotelaccelerator.com",
    },
  })
  return r.status
}

async function main() {
  console.log(`Server: ${BASE}`)

  const { userId, propertyName } = await creaMembroTemporaneo()
  console.log(`Membro temporaneo creato su "${propertyName}": ${EMAIL_TEMP}`)
  console.log("Nessuna area concessa: e' il caso che la guardia deve respingere.\n")

  let uscita = 0
  try {
    const token = await tokenPer(EMAIL_TEMP)
    if (!token) throw new Error("nessun token ottenuto")

    const casi = [
      // Aree NON concesse: in "observe" passano, in "enforce" devono dare 403.
      ["/api/admin/crm/contacts", "crm", "NON concessa"],
      ["/api/cms/pages", "cms", "NON concessa"],
      // ATTENZIONE: `todos` ha un 403 TUTTO SUO (route.ts riga 36), che
      // risponde anche a guardia spenta. Tenuto fuori dal conteggio: altrimenti
      // la guardia si prenderebbe il merito di un blocco che non e' suo, e in
      // "observe" sembrerebbe non essersi spenta.
      ["/api/admin/todos", "todos (403 proprio, non della guardia)", "NON conteggiata"],
      // CONTROLLO POSITIVO: aree di base, sempre concesse. Non devono MAI dare
      // 403. Se lo dessero, la guardia sarebbe sempre-rossa.
      ["/api/platform/me", "profile (di base)", "SEMPRE concessa"],
      ["/api/inbox/conversations", "inbox (di base)", "SEMPRE concessa"],
    ]

    const risultati = []
    for (const [percorso, area, atteso] of casi) {
      const stato = await chiama(percorso, token)
      risultati.push({ percorso, area, atteso, stato })
      console.log(`  ${String(stato).padEnd(4)} ${percorso}  [${area}] ${atteso}`)
    }

    console.log("")
    const baseNegata = risultati.filter((r) => r.atteso === "SEMPRE concessa" && r.stato === 403)
    if (baseNegata.length > 0) {
      console.log("ALLARME: un'area di base ha dato 403. La guardia e' sempre-rossa.")
      for (const r of baseNegata) console.log(`  - ${r.percorso}`)
      uscita = 1
    }

    const attribuibili = risultati.filter((r) => r.atteso === "NON concessa")
    const negate = attribuibili.filter((r) => r.stato === 403)
    console.log(`Aree non concesse che rispondono 403: ${negate.length} su ${attribuibili.length}`)
    console.log(`Aree di base bloccate: ${baseNegata.length} su 2 (0 = corretto)`)
    console.log("")
    console.log(
      negate.length === 0
        ? 'Modalita\' "observe": nessun blocco applicato. Cerca "area-guard observe" nei log.'
        : 'Modalita\' "enforce": i blocchi sono attivi.',
    )
  } finally {
    // SEMPRE, anche se le verifiche sopra sono esplose a meta'.
    const pulito = await rimuoviMembroTemporaneo(userId)
    if (!pulito) uscita = 1
  }

  process.exit(uscita)
}

main().catch(async (e) => {
  console.error("ERRORE:", e.message)
  process.exit(1)
})
