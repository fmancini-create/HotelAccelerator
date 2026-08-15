import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import {
  trovaAnagraficaPerNumero,
  trovaAnagraficaPerEmail,
  datiNotiDaAnagrafica,
  collegaConversazioneAdAnagrafica,
} from "@/lib/crm/contact-identity"

const CAMPI_TEST = "id, name, email, phone, whatsapp_id, source"
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

  // 9. L'UNIONE VERA, su copie di prova: la scheda esistente riceve il numero,
  // la conversazione cambia nome, il doppione resta ma marcato.
  const { data: schedaVera } = await supabase
    .from("contacts")
    .insert({
      property_id: PROP,
      name: "ZZTEST-v0 Mario Rossi",
      email: "zztest-v0-mario@example.invalid",
      source: "manual",
    })
    .select(CAMPI_TEST)
    .single()
  const { data: doppioneCanale } = await supabase
    .from("contacts")
    .insert({ property_id: PROP, name: "MR", whatsapp_id: NUMERO, source: "whatsapp" })
    .select(CAMPI_TEST)
    .single()
  const { data: convProva } = await supabase
    .from("conversations")
    .insert({
      property_id: PROP,
      channel: "whatsapp",
      subject: "WhatsApp · MR",
      contact_name: "MR",
      contact_id: doppioneCanale?.id,
      status: "open",
    })
    .select("id")
    .single()

  if (schedaVera && doppioneCanale && convProva) {
    const esito = await collegaConversazioneAdAnagrafica({
      supabase,
      propertyId: PROP,
      conversationId: convProva.id as string,
      anagrafica: schedaVera as never,
      numero: NUMERO,
      anagraficaDaUnireId: doppioneCanale.id as string,
    })
    const { data: convDopo } = await supabase
      .from("conversations")
      .select("contact_id, contact_name, subject")
      .eq("id", convProva.id as string)
      .maybeSingle()
    const { data: schedaDopo } = await supabase
      .from("contacts")
      .select("phone, whatsapp_id")
      .eq("id", schedaVera.id as string)
      .maybeSingle()
    const { data: doppioneDopo } = await supabase
      .from("contacts")
      .select("id, custom_fields")
      .eq("id", doppioneCanale.id as string)
      .maybeSingle()
    // Dopo l'unione, il numero da solo deve trovare la scheda CURATA, non "MR".
    const riconoscimentoDopo = await trovaAnagraficaPerNumero(supabase, PROP, NUMERO)

    esiti.unione = {
      esito_collegata: esito.collegata,
      numero_salvato_sulla_scheda: esito.numeroSalvato,
      conversazione_ora_punta_alla_scheda_vera: convDopo?.contact_id === schedaVera.id,
      nome_mostrato_prima: "MR",
      nome_mostrato_dopo: convDopo?.contact_name,
      oggetto_dopo: convDopo?.subject,
      numero_scritto: { phone: schedaDopo?.phone, whatsapp_id: schedaDopo?.whatsapp_id },
      doppione_esiste_ancora: Boolean(doppioneDopo),
      doppione_marcato_unito: Boolean(
        (doppioneDopo?.custom_fields as Record<string, unknown> | null)?.unita_in_anagrafica_id,
      ),
      riconoscimento_successivo_dal_solo_numero: riconoscimentoDopo?.name,
      vince_la_scheda_curata: riconoscimentoDopo?.id === schedaVera.id,
    }

    await supabase.from("conversations").delete().eq("id", convProva.id as string)
    await supabase.from("contacts").delete().eq("id", doppioneCanale.id as string)
    await supabase.from("contacts").delete().eq("id", schedaVera.id as string)
  }

  // 10. il numero NON deve sovrascrivere un telefono inserito a mano
  const { data: conTelefono } = await supabase
    .from("contacts")
    .insert({
      property_id: PROP,
      name: "ZZTEST-v0 Con Telefono",
      email: "zztest-v0-tel@example.invalid",
      phone: "+39 011 1234567",
      source: "manual",
    })
    .select(CAMPI_TEST)
    .single()
  const { data: convB } = await supabase
    .from("conversations")
    .insert({ property_id: PROP, channel: "whatsapp", subject: "x", contact_name: "x", status: "open" })
    .select("id")
    .single()
  if (conTelefono && convB) {
    await collegaConversazioneAdAnagrafica({
      supabase,
      propertyId: PROP,
      conversationId: convB.id as string,
      anagrafica: conTelefono as never,
      numero: NUMERO,
    })
    const { data: dopo } = await supabase
      .from("contacts")
      .select("phone, whatsapp_id")
      .eq("id", conTelefono.id as string)
      .maybeSingle()
    esiti.non_sovrascrive = {
      phone_resta: dopo?.phone,
      corretto: dopo?.phone === "+39 011 1234567",
      whatsapp_id_riempito_perche_era_vuoto: dopo?.whatsapp_id === NUMERO,
    }
    await supabase.from("conversations").delete().eq("id", convB.id as string)
    await supabase.from("contacts").delete().eq("id", conTelefono.id as string)
  }

  // 11. il nome congelato ("FM" dal 18/06) viene aggiornato? e una scheda
  // curata resta intoccata?
  const processor = new WhatsAppProcessor(supabase)
  const chiamaPrivato = (processor as never as Record<string, unknown>)
    .aggiornaNomeDaProfilo as (p: string, c: unknown, n: string) => Promise<string>

  const { data: schedaCanale } = await supabase
    .from("contacts")
    .insert({ property_id: PROP, name: "ZZTEST-v0 FM", whatsapp_id: NUMERO, source: "whatsapp" })
    .select("id, name, source")
    .single()
  const { data: convCanale } = await supabase
    .from("conversations")
    .insert({
      property_id: PROP,
      channel: "whatsapp",
      subject: "WhatsApp · ZZTEST-v0 FM",
      contact_name: "ZZTEST-v0 FM",
      contact_id: schedaCanale?.id,
      status: "open",
    })
    .select("id")
    .single()

  const nomeReso = await chiamaPrivato.call(processor, PROP, schedaCanale, "ZZTEST-v0 Filippo Mancini")
  const { data: canaleDopo } = await supabase
    .from("contacts")
    .select("name")
    .eq("id", schedaCanale?.id as string)
    .maybeSingle()
  const { data: convDopoNome } = await supabase
    .from("conversations")
    .select("contact_name, subject")
    .eq("id", convCanale?.id as string)
    .maybeSingle()

  const { data: schedaCurata } = await supabase
    .from("contacts")
    .insert({ property_id: PROP, name: "ZZTEST-v0 Sig.ra Bianchi", whatsapp_id: NUMERO, source: "manual" })
    .select("id, name, source")
    .single()
  const nomeCurato = await chiamaPrivato.call(processor, PROP, schedaCurata, "ZZTEST-v0 mancio piccio")
  const { data: curataDopo } = await supabase
    .from("contacts")
    .select("name")
    .eq("id", schedaCurata?.id as string)
    .maybeSingle()

  // ripiego "+39..." non deve sostituire un nome
  const schedaRipiego = { id: schedaCanale?.id as string, name: "ZZTEST-v0 Filippo Mancini", source: "whatsapp" }
  const nomeRipiego = await chiamaPrivato.call(processor, PROP, schedaRipiego, "+393358046836")
  const { data: ripiegoDopo } = await supabase
    .from("contacts")
    .select("name")
    .eq("id", schedaCanale?.id as string)
    .maybeSingle()

  esiti.nome_profilo = {
    scheda_del_canale: {
      prima: "ZZTEST-v0 FM",
      dopo: canaleDopo?.name,
      aggiornata: canaleDopo?.name === "ZZTEST-v0 Filippo Mancini",
      elenco_aggiornato: convDopoNome?.contact_name === "ZZTEST-v0 Filippo Mancini",
      oggetto: convDopoNome?.subject,
      restituito: nomeReso,
    },
    scheda_curata: {
      prima: "ZZTEST-v0 Sig.ra Bianchi",
      dopo: curataDopo?.name,
      intoccata: curataDopo?.name === "ZZTEST-v0 Sig.ra Bianchi",
      restituito: nomeCurato,
    },
    ripiego_numero: {
      dopo: ripiegoDopo?.name,
      non_sostituisce: ripiegoDopo?.name === "ZZTEST-v0 Filippo Mancini",
      restituito: nomeRipiego,
    },
  }

  if (convCanale?.id) await supabase.from("conversations").delete().eq("id", convCanale.id as string)
  if (schedaCanale?.id) await supabase.from("contacts").delete().eq("id", schedaCanale.id as string)
  if (schedaCurata?.id) await supabase.from("contacts").delete().eq("id", schedaCurata.id as string)

  // 12. residui finali
  const { data: finali } = await supabase.from("contacts").select("id").like("name", "ZZTEST-v0%")
  const { data: convResidue } = await supabase
    .from("conversations")
    .select("id")
    .eq("property_id", PROP)
    .in("subject", ["WhatsApp · MR", "x"])
  esiti.residui_finali = { anagrafiche: (finali ?? []).length, conversazioni: (convResidue ?? []).length }

  return NextResponse.json(esiti, { status: 200 })
}
