/**
 * Prova le regole di unione su un contatto VERO della rubrica.
 *
 * Le prove in `test-pms-merge.ts` usano casi costruiti a mano: dimostrano che le
 * regole sono giuste, non che funzionino sui dati che questa struttura ha
 * davvero. Qui si prende un contatto reale e si mostra, senza scrivere niente,
 * cosa l'integrazione farebbe.
 */

import { uniscoContattoEOspite } from "@/lib/pms/merge"

function env(nome: string): string {
  const v = process.env[nome]
  if (!v) throw new Error(`Variabile ${nome} assente: la sonda non puo' leggere i dati veri.`)
  return v
}

async function main() {
  const U = env("SUPABASE_URL")
  const H = {
    apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
    Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
  }

  const campi = "id,name,email,phone,city,country,company,language,tags,marketing_consent,gdpr_consent,unsubscribed"
  const r = await fetch(`${U}/rest/v1/contacts?select=${campi}&email=ilike.*gmail.com&limit=1`, { headers: H })
  if (!r.ok) throw new Error(`Lettura contatti fallita: ${r.status}`)
  const righe = (await r.json()) as Array<Record<string, unknown>>
  if (!righe.length) throw new Error("Nessun contatto con email gmail: la sonda non ha dati su cui girare.")
  const c = righe[0]

  const contatto = {
    id: String(c.id),
    name: (c.name as string) ?? null,
    email: (c.email as string) ?? null,
    phone: (c.phone as string) ?? null,
    city: (c.city as string) ?? null,
    country: (c.country as string) ?? null,
    company: (c.company as string) ?? null,
    language: (c.language as string) ?? null,
    tags: (c.tags as string[]) ?? null,
    marketingConsent: (c.marketing_consent as boolean) ?? null,
    gdprConsent: (c.gdpr_consent as boolean) ?? null,
    unsubscribed: (c.unsubscribed as boolean) ?? null,
  }

  // L'ospite come lo darebbe il PMS: STESSA email (ma in maiuscolo, come capita
  // nei sistemi diversi), con telefono e citta' che a noi mancano.
  const ospite = {
    pmsGuestId: "SCIDOO-PROVA",
    name: contatto.name,
    email: String(contatto.email ?? "").toUpperCase(),
    phone: "+39 335 9988776",
    city: "Firenze",
    country: "IT",
    tags: ["Cliente abituale"],
    marketingConsent: true,
    gdprConsent: true,
  }

  const u = uniscoContattoEOspite(contatto, ospite)

  console.log("=== contatto VERO in rubrica ===")
  console.log(
    `  ${contatto.name ?? "(senza nome)"} | email: ${contatto.email} | ` +
      `telefono: ${contatto.phone ?? "VUOTO"} | citta': ${contatto.city ?? "VUOTA"}`,
  )
  console.log()
  console.log("=== cosa farebbe l'unione (nessuna scrittura) ===")
  console.log(`  campi da riempire:      ${JSON.stringify(u.daRiempire)}`)
  console.log(`  conflitti da segnalare: ${JSON.stringify(u.conflitti)}`)
  console.log(`  da scrivere nel PMS:    ${JSON.stringify(u.daScrivereNelPms)}`)
  console.log(`  tag da aggiungere:      ${JSON.stringify(u.tag.daAggiungereInCrm)}`)
  for (const k of u.consensi) {
    console.log(`  consenso ${k.kind}: risultato=${k.risultato} cambiaInCrm=${k.cambiaInCrm} motivo=${k.motivo}`)
  }

  // Verifiche vere, non solo stampa: se l'email in maiuscolo generasse un
  // conflitto, ogni passata riempirebbe la coda di differenze inesistenti.
  const problemi: string[] = []
  if (u.conflitti.some((x) => x.field === "email")) {
    problemi.push("l'email con maiuscole diverse ha generato un conflitto: la normalizzazione non funziona")
  }
  if (!contatto.phone && !u.daRiempire.phone) {
    problemi.push("il telefono mancante NON viene riempito dal PMS")
  }
  console.log()
  if (problemi.length) {
    for (const p of problemi) console.log(`  FALLITO: ${p}`)
    process.exit(1)
  }
  console.log("  ok: email normalizzata (nessun falso conflitto), telefono mancante riempito.")
}

main().catch((e) => {
  console.error(`ERRORE: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
