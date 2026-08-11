/**
 * Prova del verificatore di origine delle notifiche Pub/Sub.
 *
 * Senza il CONTROLLO POSITIVO un verificatore che risponde SEMPRE "non valida"
 * supererebbe tutte le prove negative a pieni voti: e' la trappola in cui sono
 * gia' caduto piu' volte. Qui il positivo si ottiene sostituendo le chiavi
 * pubbliche di Google con una chiave di prova, e firmando con la sua privata.
 *
 * Non tocca nulla: nessun database, nessuna rete verso Google, nessuna email.
 */
import { generateKeyPairSync, createSign, randomUUID } from "node:crypto"

const esiti = []
const ok = (nome, passato, dettaglio = "") => esiti.push({ nome, passato, dettaglio })

// ── chiavi di prova ────────────────────────────────────────────────────────
const vera = generateKeyPairSync("rsa", { modulusLength: 2048 })
const impostora = generateKeyPairSync("rsa", { modulusLength: 2048 })

const KID = "prova-" + randomUUID()
const jwkVera = { ...vera.publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" }

// Sostituisce le chiavi di Google con la nostra: serve SOLO a rendere
// misurabile il caso "token buono", altrimenti non verificabile in laboratorio.
const fetchOriginale = globalThis.fetch
globalThis.fetch = async (url, ...resto) => {
  if (String(url).includes("googleapis.com/oauth2/v3/certs")) {
    return new Response(JSON.stringify({ keys: [jwkVera] }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "max-age=3600" },
    })
  }
  return fetchOriginale(url, ...resto)
}

const b64u = (b) => Buffer.from(b).toString("base64url")

function creaToken({ chiave = vera.privateKey, kid = KID, alg = "RS256", corpo = {}, firmaRotta = false } = {}) {
  const testa = b64u(JSON.stringify({ alg, kid, typ: "JWT" }))
  const payload = b64u(
    JSON.stringify({
      iss: "https://accounts.google.com",
      aud: "https://esempio.invalid/api/channels/email/webhook/gmail",
      email: "pubsub@progetto.iam.gserviceaccount.com",
      exp: Math.floor(Date.now() / 1000) + 600,
      ...corpo,
    }),
  )
  if (alg === "none") return `${testa}.${payload}.`
  const f = createSign("RSA-SHA256")
  f.update(`${testa}.${payload}`)
  f.end()
  const firma = f.sign(firmaRotta ? impostora.privateKey : chiave).toString("base64url")
  return `${testa}.${payload}.${firma}`
}

const richiesta = (token) =>
  new Request("https://esempio.invalid/api/channels/email/webhook/gmail", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })

// ── esecuzione ─────────────────────────────────────────────────────────────
const { verificaNotificaPubSub } = await import("../lib/email/pubsub-verify.ts")

console.log("\n─── VERIFICATORE ORIGINE PUB/SUB ───\n")

// CONTROLLO POSITIVO: senza questo, un verificatore sempre-negativo sarebbe
// indistinguibile da uno funzionante.
const buono = await verificaNotificaPubSub(richiesta(creaToken()))
ok("CONTROLLO POSITIVO: token ben firmato -> valida", buono.stato === "valida", `stato=${buono.stato}${buono.motivo ? ` (${buono.motivo})` : ""}`)

const senza = await verificaNotificaPubSub(richiesta(null))
ok("nessuna intestazione -> assente (e' il caso odierno)", senza.stato === "assente", `stato=${senza.stato}`)

const falsificato = await verificaNotificaPubSub(richiesta(creaToken({ firmaRotta: true })))
ok("firma di un impostore -> non valida", falsificato.stato === "non_valida", `stato=${falsificato.stato} — ${falsificato.motivo || ""}`)

const algNone = await verificaNotificaPubSub(richiesta(creaToken({ alg: "none" })))
ok("alg:none rifiutato (scavalcherebbe la firma)", algNone.stato === "non_valida", `stato=${algNone.stato} — ${algNone.motivo || ""}`)

const kidIgnoto = await verificaNotificaPubSub(richiesta(creaToken({ kid: "kid-inesistente" })))
ok("kid sconosciuto -> non valida", kidIgnoto.stato === "non_valida", `stato=${kidIgnoto.stato} — ${kidIgnoto.motivo || ""}`)

const scaduto = await verificaNotificaPubSub(richiesta(creaToken({ corpo: { exp: Math.floor(Date.now() / 1000) - 60 } })))
ok("token scaduto -> non valida", scaduto.stato === "non_valida", `stato=${scaduto.stato} — ${scaduto.motivo || ""}`)

const emittente = await verificaNotificaPubSub(richiesta(creaToken({ corpo: { iss: "https://malintenzionato.invalid" } })))
ok("emittente estraneo -> non valida", emittente.stato === "non_valida", `stato=${emittente.stato} — ${emittente.motivo || ""}`)

const storpio = await verificaNotificaPubSub(richiesta("non-e-un-token"))
ok("token malformato -> non valida (senza eccezioni)", storpio.stato === "non_valida", `stato=${storpio.stato}`)

// ── riepilogo ──────────────────────────────────────────────────────────────
console.log("─── ESITI ───")
let verdi = 0
for (const e of esiti) {
  console.log(`  ${e.passato ? "VERDE" : "ROSSO"}  ${e.nome}${e.dettaglio ? ` — ${e.dettaglio}` : ""}`)
  if (e.passato) verdi++
}
const ATTESE = 8
console.log(`\n  ${verdi}/${esiti.length} verdi (attese ${ATTESE})`)
if (esiti.length < ATTESE) console.error("  ESITO: FALLITA — prove mancanti")
process.exit(verdi === esiti.length && esiti.length === ATTESE ? 0 : 1)
