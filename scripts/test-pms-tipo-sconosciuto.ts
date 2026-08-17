/**
 * Il caso peggiore: una struttura con credenziali VERE e un `pms_type` che non
 * conosciamo (fornitore nuovo configurato a mano, errore di battitura).
 *
 * Deve accadere questo:
 *  - la pagina di governo continua a rispondere (e' l'unico posto da cui si
 *    corregge la configurazione: con un 500 resterebbero invisibili anche i
 *    conflitti da rivedere);
 *  - la connessione risulta NON riuscita, col motivo leggibile;
 *  - nessuna capacita' viene dichiarata, quindi nessun interruttore e' azionabile;
 *  - accendere un interruttore viene RIFIUTATO, non salvato.
 *
 * Scrive su `pms_integrations` e ripristina lo stato iniziale.
 *
 * Uso: set -a; source /vercel/share/.env.project; set +a; npx tsx scripts/test-pms-tipo-sconosciuto.ts
 */

import { createClient } from "@supabase/supabase-js"

const URL_SB = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const CHIAVE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? ""
const BASE = process.env.PROBE_BASE_URL ?? "http://localhost:3000"

if (!URL_SB || !CHIAVE) {
  console.error("Variabili Supabase assenti: la prova NON e' stata eseguita (non e' un successo).")
  process.exit(1)
}

const sb = createClient(URL_SB, CHIAVE, { auth: { persistSession: false } })

let ok = 0
let ko = 0
function esito(descrizione: string, condizione: boolean, dettaglio = "") {
  if (condizione) {
    ok += 1
    console.log(`  ok    ${descrizione}`)
  } else {
    ko += 1
    console.log(`  KO    ${descrizione}${dettaglio ? ` -> ${dettaglio}` : ""}`)
  }
}

async function main() {
  const { data: property, error: errP } = await sb.from("properties").select("id, name").limit(1).maybeSingle()
  if (errP) throw new Error(`Lettura struttura fallita: ${errP.message}`)
  if (!property) throw new Error("Nessuna struttura: la prova non puo' essere eseguita.")

  // Stato di partenza, per ripristinarlo alla lettera.
  const { data: prima } = await sb
    .from("pms_integrations")
    .select("id, pms_type, is_active, auth_code_encrypted, write_contacts")
    .eq("property_id", property.id)
    .maybeSingle()

  console.log(`\n== Tipo di PMS non riconosciuto (struttura: ${property.name}) ==`)

  const riga = {
    property_id: property.id,
    // Un valore che il registro NON conosce, con credenziali presenti: cosi'
    // `caricaProvider` non ripiega sul fornitore di prova e prova a costruire
    // davvero il connettore.
    pms_type: "pms-inesistente-di-prova",
    // `name` e' obbligatorio nella tabella: senza, Postgres rifiuta l'intera
    // riga e la prova si fermerebbe prima di verificare qualsiasi cosa.
    name: "Configurazione di prova (tipo ignoto)",
    is_active: true,
    auth_code_encrypted: "credenziale-di-prova",
    api_url: "https://example.invalid/api/",
  }

  if (prima) {
    const { error } = await sb.from("pms_integrations").update(riga).eq("id", prima.id)
    if (error) throw new Error(`Scrittura configurazione fallita: ${error.message}`)
  } else {
    const { error } = await sb.from("pms_integrations").insert(riga)
    if (error) throw new Error(`Inserimento configurazione fallito: ${error.message}`)
  }

  try {
    const r = await fetch(`${BASE}/api/crm/pms-sync`)
    esito("la pagina di governo risponde, non cade con un 500", r.status === 200, `codice ${r.status}`)

    const corpo = (await r.json()) as Record<string, unknown>
    const p = (corpo.provider ?? {}) as Record<string, unknown>
    const connessione = (p.connessione ?? {}) as Record<string, unknown>
    const capacita = (p.capacita ?? {}) as Record<string, boolean>
    const limiti = (p.limiti ?? []) as string[]

    esito("la connessione risulta NON riuscita", connessione.ok === false, JSON.stringify(connessione))
    esito(
      "il motivo nomina il valore non riconosciuto",
      String(connessione.detail ?? "").includes("pms-inesistente-di-prova"),
      String(connessione.detail),
    )
    esito(
      "nessuna capacita' dichiarata: nessun interruttore azionabile",
      Object.values(capacita).every((v) => v === false),
      JSON.stringify(capacita),
    )
    esito("il limite e' mostrato a schermo", limiti.length >= 1, JSON.stringify(limiti))
    // I conflitti devono restare visibili: sono il lavoro che qualcuno deve fare.
    esito("i conflitti restano leggibili", Array.isArray(corpo.conflitti), typeof corpo.conflitti)

    const put = await fetch(`${BASE}/api/crm/pms-sync`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ write_contacts: true }),
    })
    esito("accendere un interruttore viene rifiutato", put.status === 422, `codice ${put.status}`)

    // La prova che conta: il rifiuto non deve aver salvato nulla.
    const { data: dopo } = await sb
      .from("pms_integrations")
      .select("write_contacts")
      .eq("property_id", property.id)
      .maybeSingle()
    esito("l'interruttore NON risulta salvato", dopo?.write_contacts !== true, String(dopo?.write_contacts))
  } finally {
    console.log("\n== Ripristino ==")
    if (prima) {
      const { error } = await sb
        .from("pms_integrations")
        .update({
          pms_type: prima.pms_type,
          is_active: prima.is_active,
          auth_code_encrypted: prima.auth_code_encrypted,
          write_contacts: prima.write_contacts,
        })
        .eq("id", prima.id)
      esito("configurazione riportata allo stato iniziale", !error, error?.message ?? "")
      const { data: verifica } = await sb.from("pms_integrations").select("pms_type").eq("id", prima.id).maybeSingle()
      esito("il tipo di prova non e' rimasto", verifica?.pms_type === prima.pms_type, String(verifica?.pms_type))
    } else {
      const { error } = await sb.from("pms_integrations").delete().eq("property_id", property.id)
      esito("riga di prova rimossa", !error, error?.message ?? "")
      // Verifica, non fiducia: la tabella era vuota e deve tornare vuota, o
      // lascerei in giro una configurazione finta che sembra vera.
      const { data: resti } = await sb.from("pms_integrations").select("id").eq("property_id", property.id)
      esito("nessuna configurazione di prova sopravvissuta", (resti?.length ?? 0) === 0, `${resti?.length ?? 0} righe`)
    }
  }

  console.log(`\n  ${ok}/${ok + ko} verifiche superate`)
  if (ko > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error(`\nProva interrotta: ${e instanceof Error ? e.message : String(e)}`)
  process.exitCode = 1
})
