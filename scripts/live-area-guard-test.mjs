#!/usr/bin/env node
/**
 * Prova END-TO-END della guardia di area, sul server in esecuzione.
 *
 * Non verifica il codice: verifica il COMPORTAMENTO. Genera una sessione vera
 * per il membro non-admin e chiama le API come farebbe lui dal browser.
 *
 * Perche' serve: fin qui la guardia e' stata provata in isolamento. Una logica
 * corretta ma non collegata al percorso reale delle richieste darebbe le stesse
 * prove verdi e zero protezione.
 *
 * Include un CONTROLLO POSITIVO (un'area concessa che deve PASSARE): senza,
 * non si distingue una guardia che funziona da una che blocca tutto.
 */

import { createClient } from "@supabase/supabase-js"

const BASE = process.env.BASE_URL || "http://localhost:3000"
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMAIL_MEMBRO = "pippomancio@gmail.com"

if (!url || !serviceKey) {
  console.error("Mancano SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.")
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

/** Genera un access token valido per l'utente, senza conoscerne la password. */
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
  console.log(`Utente: ${EMAIL_MEMBRO} (membro, nessuna area concessa)\n`)

  const token = await tokenPer(EMAIL_MEMBRO)
  if (!token) {
    console.error("Nessun token ottenuto.")
    process.exit(1)
  }
  console.log("Sessione ottenuta.\n")

  const casi = [
    // Aree NON concesse: in "observe" passano (200/4xx applicativo), in
    // "enforce" devono dare 403.
    ["/api/admin/crm/contacts", "crm", "NON concessa"],
    ["/api/admin/todos", "todos", "NON concessa"],
    ["/api/cms/pages", "cms", "NON concessa"],
    // CONTROLLO POSITIVO: area di base, sempre concessa. Non deve MAI dare 403,
    // in nessuna modalita'. Se lo desse, la guardia sarebbe sempre-rossa.
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
    process.exit(1)
  }

  const negate = risultati.filter((r) => r.atteso === "NON concessa" && r.stato === 403)
  console.log(`Aree non concesse che rispondono 403: ${negate.length} su 3`)
  console.log(`Aree di base bloccate: 0 su 2 (corretto)`)
  console.log("")
  console.log(
    negate.length === 0
      ? 'Modalita\' "observe": nessun blocco applicato, come previsto. Cerca "area-guard observe" nei log.'
      : 'Modalita\' "enforce": i blocchi sono attivi.',
  )
}

main().catch((e) => {
  console.error("ERRORE:", e.message)
  process.exit(1)
})
