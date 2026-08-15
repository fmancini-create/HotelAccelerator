import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import {
  trovaAnagraficaPerNumero,
  trovaAnagraficaPerEmail,
  datiNotiDaAnagrafica,
} from "@/lib/crm/contact-identity"
import { regolaContattoStaff } from "@/lib/ai/generate"

// SONDA TEMPORANEA — da rimuovere dopo la verifica.
export async function GET() {
  const supabase = createServiceClient()
  const PROP = "c16ad260-2c34-4544-9909-5cd444773986"
  const NUMERO = "393358046836"
  const esiti: Record<string, unknown> = {}

  // 1. formati realistici scritti a mano: vengono riconosciuti?
  const formati = ["+39 335 8046836", "335/8046836", "0039 335-8046836", "3358046836"]
  const creati: string[] = []
  const trovati: Record<string, unknown> = {}
  for (const f of formati) {
    const { data, error } = await supabase
      .from("contacts")
      .insert({ property_id: PROP, name: `ZZTEST-v0 ${f}`, phone: f, source: "manual" })
      .select("id, phone, phone_digits")
      .single()
    if (error) {
      trovati[f] = `errore inserimento: ${error.message}`
      continue
    }
    creati.push(data.id as string)
    const ris = await trovaAnagraficaPerNumero(supabase, PROP, NUMERO)
    trovati[f] = {
      phone_digits_generato: data.phone_digits,
      riconosciuto: ris ? ris.name : null,
      e_il_mio: ris?.id === data.id,
    }
    await supabase.from("contacts").delete().eq("id", data.id as string)
    creati.pop()
  }
  esiti.formati = trovati

  // 2. pulizia: nessun residuo di prova
  const { data: residui } = await supabase.from("contacts").select("id, name").like("name", "ZZTEST-v0%")
  esiti.residui = (residui ?? []).length
  for (const r of residui ?? []) await supabase.from("contacts").delete().eq("id", r.id as string)

  // 3. il ponte email trova la scheda vera?
  const perEmail = await trovaAnagraficaPerEmail(supabase, PROP, "pippomancio@gmail.com")
  esiti.ponte_email = perEmail ? { id: perEmail.id, nome: perEmail.name, phone: perEmail.phone } : null

  // 4. email vuota non deve agganciare nulla
  const vuota = await trovaAnagraficaPerEmail(supabase, PROP, "")
  esiti.email_vuota_aggancia = vuota ? `SI (difetto): ${vuota.name}` : "no (corretto)"

  // 5. dati noti: cosa vedrebbe il bot oggi per questa conversazione
  const attuale = await trovaAnagraficaPerNumero(supabase, PROP, NUMERO)
  esiti.dati_noti_ora = datiNotiDaAnagrafica(attuale, NUMERO, "FM")

  // 6. numero troppo corto: nessun aggancio
  const corto = await trovaAnagraficaPerNumero(supabase, PROP, "123")
  esiti.numero_corto = corto ? `AGGANCIA (difetto): ${corto.name}` : "no (corretto)"

  // 7. CONTROPROVA: il vecchio confronto esatto avrebbe trovato un numero
  // scritto a mano? Se lo trovasse, la prova sopra non dimostrerebbe nulla.
  const { data: prova } = await supabase
    .from("contacts")
    .insert({ property_id: PROP, name: "ZZTEST-v0 controprova", phone: "+39 335 8046836", source: "manual" })
    .select("id")
    .single()
  const { data: vecchioModo } = await supabase
    .from("contacts")
    .select("id")
    .eq("property_id", PROP)
    .eq("phone", NUMERO)
    .maybeSingle()
  const nuovoModo = await trovaAnagraficaPerNumero(supabase, PROP, NUMERO)
  esiti.controprova = {
    vecchio_confronto_esatto: vecchioModo?.id === prova?.id ? "TROVA (prova invalida)" : "NON trova (atteso)",
    nuovo_confronto_cifre: nuovoModo?.id === prova?.id ? "trova (atteso)" : "NON trova (difetto)",
  }
  if (prova?.id) await supabase.from("contacts").delete().eq("id", prova.id as string)

  // 8. il prompt del bot chiede ancora il numero?
  const conNumero = regolaContattoStaff({
    nome: "Filippo Mancini",
    email: "pippomancio@gmail.com",
    numero: "393358046836",
    daAnagraficaEsistente: true,
  })
  const senzaNulla = regolaContattoStaff(null)
  esiti.prompt = {
    con_numero_noto_vieta_la_domanda: conNumero.includes("NON chiedere MAI il numero"),
    con_numero_noto_elenca_i_dati: conNumero.includes("pippomancio@gmail.com") && conNumero.includes("Filippo Mancini"),
    con_numero_noto_chiede_conferma_email: conNumero.includes("confermo che possiamo scriverle"),
    senza_dati_non_vieta: !senzaNulla.includes("NON chiedere MAI il numero"),
    testo_con_numero_noto: conNumero,
  }

  // 9. residui finali
  const { data: finali } = await supabase.from("contacts").select("id").like("name", "ZZTEST-v0%")
  esiti.residui_finali = (finali ?? []).length

  return NextResponse.json(esiti, { status: 200 })
}
