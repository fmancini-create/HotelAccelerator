/**
 * Prova temporanea: il modello riconosce la richiesta di contatto con lo staff
 * e raccoglie i dati? Provata nei DUE versi: senza dati (deve chiedere, NON
 * promettere) e con i dati (deve prendere in carico).
 */
import { generateReply } from "@/lib/ai/generate"
import { contactIsComplete } from "@/lib/ai/handoff"

const BASE_ID = "afa2f160-9b48-41bb-82a8-2b94318933b6"
const config = { baseIds: [BASE_ID], language: "it", confidenceThreshold: 0.35 }

// La conversazione reale dello screenshot, fino alla richiesta di contatto.
const storia = [
  { role: "user" as const, content: "c'è il ristorante?" },
  { role: "assistant" as const, content: "Sì, è presente il Tiberio Bistrot, con cucina mediterranea a km zero." },
  { role: "user" as const, content: "per vedere le disponibilità?" },
  {
    role: "assistant" as const,
    content: "Per verificare le disponibilità può usare il sistema ufficiale: https://www.ibarronci.com/prenota\nSe preferisce, posso anche metterla in contatto con lo staff.",
  },
]

async function prova(etichetta: string, storiaTurni: typeof storia, messaggio: string) {
  const r = await generateReply(config, messaggio, storiaTurni)
  const completo = contactIsComplete(r.contact)
  console.log(`\n=== ${etichetta}`)
  console.log(`  messaggio ospite : "${messaggio}"`)
  console.log(`  staff_requested  : ${r.staffRequested}`)
  console.log(`  contatto         : ${JSON.stringify(r.contact)}`)
  console.log(`  dati completi    : ${completo}  -> handoff ${r.staffRequested && completo ? "REGISTRATO" : "non registrato"}`)
  console.log(`  risposta         : ${r.answer}`)
  const prometteContatto = /(ho inoltrato|inoltrata|presa in carico|la ricontatt|staff (la |ti )?(risponder|contatter))/i.test(
    r.answer ?? "",
  )
  console.log(`  promette contatto: ${prometteContatto}`)
  return { r, completo, prometteContatto }
}

async function main() {
  // VERSO 1: chiede il contatto ma non ha dato alcun dato.
  const a = await prova("VERSO 1 — nessun dato di contatto", storia, "ok mi metta in contatto")
  // VERSO 2: fornisce nome, cognome, email e telefono.
  const b = await prova(
    "VERSO 2 — dati forniti",
    [
      ...storia,
      { role: "user" as const, content: "ok mi metta in contatto" },
      { role: "assistant" as const, content: a.r.answer ?? "" },
    ],
    "Mario Rossi, mario.rossi@example.com, 3351234567",
  )

  console.log("\n--- ESITO")
  const v1 = a.r.staffRequested && !a.completo && !a.prometteContatto
  const v2 = b.r.staffRequested && b.completo
  console.log(`VERSO 1 (chiede i dati, non promette): ${v1 ? "PASS" : "FALLITO"}`)
  console.log(`VERSO 2 (dati completi, handoff parte): ${v2 ? "PASS" : "FALLITO"}`)
}

main().catch((e) => {
  console.error("ERRORE:", e?.message ?? e)
  process.exit(1)
})
