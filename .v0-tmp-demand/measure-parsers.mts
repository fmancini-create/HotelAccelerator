/** Sonda temporanea: copertura dei lettori sulle sorgenti strutturate reali. */
import { parseMyrestoo, parseScidoo, structuredSourceOf } from "../lib/demand/parsers"
import { cleanMessageText } from "../lib/demand/text"

const U = process.env.SUPABASE_URL!
const K = process.env.SUPABASE_SERVICE_ROLE_KEY!
const H = { apikey: K, Authorization: `Bearer ${K}` }
const q = async (p: string) => (await fetch(`${U}/rest/v1/${p}`, { headers: H })).json()

async function pageAll(path: string) {
  const out: any[] = []
  let off = 0
  for (;;) {
    const b = await q(`${path}&limit=1000&offset=${off}`)
    if (!Array.isArray(b)) throw new Error(JSON.stringify(b))
    out.push(...b)
    if (b.length < 1000) break
    off += 1000
  }
  return out
}

const convs = await pageAll(
  "conversations?select=id,subject,contact_email,created_at&or=(contact_email.ilike.*myrestoo*,contact_email.ilike.*scidoo*)&order=created_at.asc",
)
console.log(`conversazioni strutturate trovate: ${convs.length}`)

let myOk = 0,
  myKo = 0,
  scOk = 0,
  scKo = 0
const esempiKo: string[] = []
const dateFuori: string[] = []

// Myrestoo si legge dal solo oggetto: nessuna lettura di messaggi.
const my = convs.filter((c) => structuredSourceOf(c.contact_email) === "myrestoo")
for (const c of my) {
  const r = parseMyrestoo(c.subject, c.created_at)
  if (r) {
    myOk++
    // Controllo di sanita': la data dedotta non deve cadere lontano dalla
    // notifica, altrimenti la deduzione dell'anno sta sbagliando.
    const d = (Date.parse(r.referenceDate) - Date.parse(c.created_at)) / 86_400_000
    if (d < -3 || d > 400) dateFuori.push(`${c.subject} -> ${r.referenceDate} (notifica ${c.created_at.slice(0, 10)})`)
  } else {
    myKo++
    if (esempiKo.length < 6) esempiKo.push(`[myrestoo] ${String(c.subject).slice(0, 90)}`)
  }
}

// Scidoo richiede il corpo: si leggono i primi messaggi a blocchi.
const sc = convs.filter((c) => structuredSourceOf(c.contact_email) === "scidoo")
const ids = sc.map((c) => c.id)
const bodies = new Map<string, string>()
for (let i = 0; i < ids.length; i += 40) {
  const chunk = ids.slice(i, i + 40)
  const msgs = await q(
    `messages?select=conversation_id,content,created_at&conversation_id=in.(${chunk.join(",")})&order=created_at.asc`,
  )
  for (const m of msgs) if (!bodies.has(m.conversation_id)) bodies.set(m.conversation_id, cleanMessageText(m.content))
}
for (const c of sc) {
  const r = parseScidoo(c.subject, bodies.get(c.id) ?? "")
  if (r) scOk++
  else {
    scKo++
    if (esempiKo.length < 12) esempiKo.push(`[scidoo] ${String(c.subject).slice(0, 90)}`)
  }
}

const pct = (a: number, b: number) => (b === 0 ? "-" : `${((a / b) * 100).toFixed(1)}%`)
console.log(`\nMYRESTOO  letti ${myOk}/${my.length} (${pct(myOk, my.length)})  non letti ${myKo}`)
console.log(`SCIDOO    letti ${scOk}/${sc.length} (${pct(scOk, sc.length)})  non letti ${scKo}`)
console.log(`\ndate dedotte fuori intervallo: ${dateFuori.length}`)
for (const d of dateFuori.slice(0, 5)) console.log("   !", d)
console.log(`\nesempi non letti:`)
for (const e of esempiKo) console.log("   -", e)
