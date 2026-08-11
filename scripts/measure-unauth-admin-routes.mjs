/**
 * Prova comportamentale: le rotte `admin/*` senza alcun controllo sono
 * davvero richiamabili da un estraneo, SU PRODUZIONE?
 *
 * REGOLE DI SICUREZZA DELLA PROVA (lezioni gia' pagate):
 *  - MAI puntare a dati di produzione: l'utente bersaglio lo CREO io, con un
 *    indirizzo usa-e-getta, e lo rimuovo alla fine verificando in lettura.
 *  - MAI misurare su localhost: il bypass di sviluppo produce verdi falsi.
 *    Qui misuro sul dominio pubblico, che e' la superficie reale.
 *  - Controllo NEGATIVO obbligatorio: una rotta inesistente deve dare 404.
 *    Senza, un "200" potrebbe essere qualsiasi cosa.
 */
import { createClient } from "@supabase/supabase-js"

const BASE = process.env.PROD_BASE_URL || "https://www.hotelaccelerator.com"
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const marca = `zz-prova-${Date.now()}`
const email = `${marca}@example.invalid`
let idCreato = null

async function chiama(percorso, corpo) {
  try {
    const r = await fetch(`${BASE}${percorso}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    })
    const t = await r.text()
    return { stato: r.status, corpo: t.slice(0, 120) }
  } catch (e) {
    return { stato: 0, corpo: String(e).slice(0, 80) }
  }
}

async function esiste(em) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  return data?.users?.some((u) => u.email === em) ?? false
}

try {
  console.log(`Bersaglio: ${BASE}`)
  console.log(`Utente usa-e-getta: ${email}\n`)

  // --- CONTROLLO NEGATIVO: percorso inesistente deve dare 404 ---------------
  const finto = await chiama("/api/admin/questa-rotta-non-esiste-xyz", {})
  console.log(`Controllo negativo (rotta inesistente): ${finto.stato}`)
  if (finto.stato !== 404) {
    console.log("  ATTENZIONE: non e' 404. Il misuratore non distingue esistente da inesistente.")
  }

  // --- Creo il bersaglio ----------------------------------------------------
  const { data: creato, error: errC } = await admin.auth.admin.createUser({
    email,
    password: `Pw-${Math.random().toString(36).slice(2)}-9!`,
    email_confirm: true,
  })
  if (errC) throw new Error(`creazione: ${errC.message}`)
  idCreato = creato.user.id

  const primaEsiste = await esiste(email)
  console.log(`\nControllo positivo (l'utente esiste prima?): ${primaEsiste ? "SI" : "NO"}`)
  if (!primaEsiste) throw new Error("l'utente non risulta creato: misura non valida")

  // --- LA PROVA: chiamo /api/admin/cleanup SENZA alcuna credenziale ---------
  const esito = await chiama("/api/admin/cleanup", { email })
  console.log(`\n/api/admin/cleanup senza credenziali -> ${esito.stato} ${esito.corpo}`)

  await new Promise((r) => setTimeout(r, 1500))
  const dopoEsiste = await esiste(email)
  console.log(`L'utente esiste ancora dopo la chiamata? ${dopoEsiste ? "SI" : "NO"}`)

  console.log("\n" + "=".repeat(64))
  if (!dopoEsiste && primaEsiste) {
    console.log("FALLA CONFERMATA: un estraneo senza credenziali ha CANCELLATO")
    console.log("un account, chiamando una rotta pubblica dal dominio pubblico.")
  } else if (esito.stato === 404) {
    console.log("La rotta non e' pubblicata in produzione (404): il codice esiste")
    console.log("nel repository ma non e' raggiungibile. Va comunque chiusa.")
  } else {
    console.log(`Nessuna cancellazione (stato ${esito.stato}): la rotta non e' sfruttabile cosi'.`)
  }
  console.log("=".repeat(64))

  // --- Sonda di sola lettura sulle altre rotte scoperte --------------------
  console.log("\nAltre rotte senza controlli (solo stato, nessun effetto voluto):")
  for (const p of ["/api/admin/setup", "/api/admin/migrate-photos", "/api/admin/cleanup-photos"]) {
    const r = await chiama(p, {})
    console.log(`  ${p.padEnd(34)} ${r.stato}  ${r.corpo.replace(/\s+/g, " ").slice(0, 60)}`)
  }
} finally {
  // --- Pulizia, sempre, con verifica IN LETTURA ----------------------------
  if (idCreato) {
    await admin.auth.admin.deleteUser(idCreato).catch(() => {})
  }
  await admin.from("admin_users").delete().like("email", "zz-prova-%")
  const residuo = await esiste(email)
  const { data: au } = await admin.from("admin_users").select("id").like("email", "zz-prova-%")
  console.log(`\nPulizia verificata in lettura -> utente residuo: ${residuo ? "SI (!)" : "no"}, righe admin_users: ${au?.length ?? "?"}`)
}
