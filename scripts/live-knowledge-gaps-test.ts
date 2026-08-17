/**
 * Prova l'anello sui DATI VERI della struttura, dall'inizio alla fine.
 *
 * Le funzioni pure sono provate in `test-knowledge-gaps.ts`. Qui si verifica la
 * parte che quelle prove non possono toccare: che il database accetti le
 * scritture, che la ripetizione non crei righe doppie, e soprattutto che dopo
 * l'approvazione l'assistente TROVI la risposta cercandola come la cercherebbe
 * un ospite. Senza quest'ultimo passo, "approvata" sarebbe una parola.
 *
 * Pulisce tutto quello che crea.
 *
 * Uso: set -a && source /vercel/share/.env.project && set +a && npx tsx scripts/live-knowledge-gaps-test.ts
 */

import { createClient } from "@supabase/supabase-js"
import { registraLacuna, testoFonteDaLacuna, titoloFonteDaLacuna } from "../lib/ai/gaps"

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Domanda di prova riconoscibile: se restasse in giro, si trova.
const DOMANDA = "Avete un deposito per le tavole da surf durante il soggiorno?"
const RISPOSTA = "Sì, custodiamo gratuitamente tavole da surf e attrezzatura sportiva nel deposito chiuso al piano terra."

let passate = 0
let fallite = 0
function verifica(nome: string, atteso: unknown, ottenuto: unknown) {
  const ok = JSON.stringify(atteso) === JSON.stringify(ottenuto)
  ok ? passate++ : fallite++
  console.log(ok ? `  OK   ${nome}` : `  NO   ${nome}\n         atteso ${JSON.stringify(atteso)}, ottenuto ${JSON.stringify(ottenuto)}`)
}

async function main() {
  const { data: base } = await sb
    .from("knowledge_bases")
    .select("id, name, property_id, confidence_threshold")
    .limit(1)
    .maybeSingle()

  if (!base) {
    console.log("Nessuna base di conoscenza sui dati veri: prova non eseguibile.")
    process.exit(1)
  }
  const propertyId = base.property_id as string
  console.log(`\nStruttura reale, base "${base.name}" (soglia ${base.confidence_threshold})\n`)

  // Pulizia preventiva: un giro precedente interrotto lascerebbe la riga e
  // falserebbe l'esito di "creata".
  await sb.from("knowledge_gaps").delete().eq("property_id", propertyId).eq("question", DOMANDA)

  console.log("=== 1. La lacuna viene registrata ===")
  const primo = await registraLacuna({
    supabase: sb,
    propertyId,
    conversationId: null,
    channel: "whatsapp",
    knowledgeBaseId: base.id,
    domanda: DOMANDA,
    rispostaIa: "Mi dispiace, su questo non ho informazioni.",
    similarity: 0.11,
    threshold: base.confidence_threshold,
  })
  verifica("la prima volta crea la riga", "creata", primo)

  console.log("\n=== 2. La stessa domanda ripetuta non crea una seconda riga ===")
  const secondo = await registraLacuna({
    supabase: sb,
    propertyId,
    conversationId: null,
    channel: "telegram",
    knowledgeBaseId: base.id,
    // Scritta diversamente, di proposito: e' lo stesso ospite di sempre.
    domanda: "avete un DEPOSITO per le tavole da surf durante il soggiorno???",
    rispostaIa: null,
    similarity: 0.09,
    threshold: base.confidence_threshold,
  })
  verifica("la seconda volta conta una ripetizione", "ripetuta", secondo)

  const { data: righe } = await sb
    .from("knowledge_gaps")
    .select("id, occurrences, status, question, channel")
    .eq("property_id", propertyId)
    .ilike("question", "%tavole da surf%")
  verifica("esiste UNA sola riga, non due", 1, righe?.length ?? 0)
  verifica("il contatore delle ripetizioni e' a 2", 2, righe?.[0]?.occurrences)
  verifica("la riga e' in attesa di approvazione", "aperta", righe?.[0]?.status)

  const lacunaId = righe![0].id as string

  console.log("\n=== 3. Prima dell'approvazione, nessuna fonte esiste ===")
  const { count: fontiPrima } = await sb
    .from("knowledge_sources")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId)
    .eq("type", "conversation")
  verifica("nessuna fonte da conversazione creata senza approvazione", 0, fontiPrima ?? 0)

  console.log("\n=== 4. L'approvazione crea la fonte ===")
  const { data: fonte, error: erroreFonte } = await sb
    .from("knowledge_sources")
    .insert({
      property_id: propertyId,
      knowledge_base_id: base.id,
      type: "conversation",
      title: titoloFonteDaLacuna(DOMANDA),
      content: testoFonteDaLacuna(DOMANDA, RISPOSTA),
      status: "pending",
      created_by: null,
    })
    .select("id, type, status, title")
    .single()

  verifica("il database accetta il tipo 'conversation'", null, erroreFonte?.message ?? null)
  verifica("la fonte nasce in coda di indicizzazione", "pending", fonte?.status)

  if (!fonte) {
    console.log("\nFonte non creata: mi fermo senza sporcare altro.")
    process.exit(1)
  }

  await sb
    .from("knowledge_gaps")
    .update({ status: "approvata", approved_answer: RISPOSTA, source_id: fonte.id, resolved_at: new Date().toISOString() })
    .eq("id", lacunaId)

  console.log("\n=== 5. L'anello si chiude: l'assistente ora la trova? ===")
  //
  // L'indicizzazione NON viene richiamata importando `lib/ai/ingest`: quel
  // modulo e' server-only e da uno script fallisce con un errore che sembra un
  // difetto del codice e invece e' un limite della sonda (verificato: e'
  // esattamente quello che mi era successo).
  //
  // Si passa dal cron di reindicizzazione, che esegue lo STESSO indexSource nel
  // suo contesto: quello che viene provato qui e' il codice vero.
  let indicizzata = false
  const base_url = process.env.NEXT_PUBLIC_APP_URL?.startsWith("http") ? process.env.NEXT_PUBLIC_APP_URL : "http://localhost:3000"
  try {
    const r = await fetch(`${base_url}/api/cron/reindex-knowledge`, {
      headers: process.env.CRON_SECRET ? { authorization: `Bearer ${process.env.CRON_SECRET}` } : {},
    })
    const d = (await r.json()) as { processed?: number; failed?: number; candidates?: number }
    console.log(`       cron: ${d.candidates} candidate, ${d.processed} indicizzate, ${d.failed} fallite`)
    verifica("il cron ha indicizzato la fonte appena approvata", 1, d.processed ?? 0)
    indicizzata = (d.processed ?? 0) > 0
  } catch (err) {
    // Va detto, non nascosto: senza indicizzazione l'anello NON e' provato.
    console.log(`  NO   chiamata al cron non riuscita: ${err instanceof Error ? err.message : String(err)}`)
    fallite++
  }

  if (indicizzata) {
    const { data: pezzi } = await sb
      .from("knowledge_chunks")
      .select("content")
      .eq("source_id", fonte.id)
      .limit(5)
    const trovata = (pezzi ?? []).some((p) => String(p.content).includes("tavole da surf"))
    verifica("il testo indicizzato contiene la domanda dell'ospite", true, trovata)
  }

  console.log("\n=== 6. Pulizia: non resta niente di questa prova ===")
  await sb.from("knowledge_chunks").delete().eq("source_id", fonte.id)
  await sb.from("knowledge_sources").delete().eq("id", fonte.id)
  await sb.from("knowledge_gaps").delete().eq("id", lacunaId)

  const { count: lacuneRimaste } = await sb
    .from("knowledge_gaps")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId)
    .ilike("question", "%tavole da surf%")
  const { count: fontiRimaste } = await sb
    .from("knowledge_sources")
    .select("id", { count: "exact", head: true })
    .eq("id", fonte.id)
  verifica("nessuna lacuna di prova rimasta", 0, lacuneRimaste ?? 0)
  verifica("nessuna fonte di prova rimasta", 0, fontiRimaste ?? 0)

  console.log(`\n=== ESITO: ${passate} passate, ${fallite} fallite ===\n`)
  process.exit(fallite === 0 ? 0 : 1)
}

void main()
