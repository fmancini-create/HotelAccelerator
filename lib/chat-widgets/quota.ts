import "server-only"
import { createServiceClient } from "@/lib/supabase/server"

/**
 * Quota dei widget chat, con contatore PROPRIO.
 *
 * Non usa `maxEmbedScripts` di `lib/tenant-quotas.ts` per una ragione concreta:
 * quella quota e' condivisa con gli altri script incorporabili, quindi creare
 * widget avrebbe consumato la disponibilita' di funzioni diverse, e il cliente
 * si sarebbe trovato bloccato altrove senza capire perche'.
 *
 * Ricalcato su `lib/whatsapp/quota.ts` (numeri WhatsApp extra), gia' in
 * produzione: inclusi + extra, dove gli extra li incrementa SOLO il webhook di
 * pagamento. Il pannello non puo' alzarli da se'.
 */

export const WIDGET_INCLUSI_PREDEFINITI = 2

export interface QuotaWidget {
  /** Compresi nel piano. */
  inclusi: number
  /** Acquistati come addon. */
  extra: number
  /** inclusi + extra. */
  limite: number
  /** Widget attivi che occupano posto. */
  usati: number
  disponibili: number
  puoCrearne: boolean
}

export async function getQuotaWidget(propertyId: string): Promise<QuotaWidget> {
  const supabase = createServiceClient()

  const { data: riga } = await supabase
    .from("chat_widget_quota")
    .select("included_widgets, extra_widgets")
    .eq("property_id", propertyId)
    .maybeSingle()

  const inclusi = riga?.included_widgets ?? WIDGET_INCLUSI_PREDEFINITI
  const extra = riga?.extra_widgets ?? 0
  const limite = inclusi + extra

  // Contano solo i widget ATTIVI: uno spento non occupa posto, altrimenti il
  // cliente resterebbe bloccato da widget che non usa piu' e non capirebbe che
  // basta eliminarli.
  const { count } = await supabase
    .from("messaging_channels")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId)
    .eq("channel_type", "chat")
    .eq("is_active", true)

  const usati = count ?? 0
  const disponibili = Math.max(0, limite - usati)

  return { inclusi, extra, limite, usati, disponibili, puoCrearne: disponibili > 0 }
}

/**
 * Incrementa gli extra di un delta (es. +1 quando il cliente ne acquista uno).
 * Legge il valore corrente prima di scrivere, cosi' due eventi Stripe che
 * arrivano insieme restano additivi invece di sovrascriversi.
 */
export async function incrementaWidgetExtra(propertyId: string, delta: number): Promise<number> {
  const supabase = createServiceClient()
  const passo = Math.max(1, Math.floor(delta))

  const { data: riga } = await supabase
    .from("chat_widget_quota")
    .select("included_widgets, extra_widgets")
    .eq("property_id", propertyId)
    .maybeSingle()

  const inclusi = riga?.included_widgets ?? WIDGET_INCLUSI_PREDEFINITI
  const nuoviExtra = (riga?.extra_widgets ?? 0) + passo

  const { error } = await supabase.from("chat_widget_quota").upsert(
    {
      property_id: propertyId,
      included_widgets: inclusi,
      extra_widgets: nuoviExtra,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "property_id", ignoreDuplicates: false },
  )
  if (error) throw new Error(`Aggiornamento quota widget fallito: ${error.message}`)

  return nuoviExtra
}

/** Prezzo di un widget aggiuntivo, in centesimi. Vive qui perche' il valore che
 *  conta e' quello che il server manda a Stripe: un prezzo scritto nel pannello
 *  sarebbe modificabile da chi apre gli strumenti del browser. */
export const PREZZO_WIDGET_EXTRA_CENTESIMI = 900 // 9 euro al mese

export interface EsitoAcquisto {
  /** true se questo pagamento ha aggiunto il widget adesso. */
  applicato: boolean
  /** true se era gia' stato registrato (evento Stripe recapitato due volte). */
  giaRegistrato: boolean
  extra: number
}

/**
 * Registra un acquisto e alza la quota UNA VOLTA SOLA.
 *
 * Stripe recapita di nuovo un evento quando non riceve conferma, e lo stesso
 * pagamento puo' quindi arrivare piu' volte. Senza una difesa, ogni recapito
 * regalerebbe un widget: per questo l'incremento avviene solo se l'inserimento
 * della sessione riesce. Il vincolo di unicita' nel database, e non un controllo
 * "esiste gia'?" in codice, e' cio' che rende la difesa affidabile anche se due
 * recapiti arrivano nello stesso istante.
 */
export async function registraAcquistoWidget(dati: {
  propertyId: string
  stripeSessionId: string
  stripeSubscriptionId?: string | null
  quantity?: number
  amountCents?: number | null
}): Promise<EsitoAcquisto> {
  const supabase = createServiceClient()
  const quantita = Math.max(1, Math.floor(dati.quantity ?? 1))

  const { error } = await supabase.from("chat_widget_purchases").insert({
    property_id: dati.propertyId,
    stripe_session_id: dati.stripeSessionId,
    stripe_subscription_id: dati.stripeSubscriptionId ?? null,
    quantity: quantita,
    amount_cents: dati.amountCents ?? null,
  })

  if (error) {
    // 23505 = violazione di unicita': lo stesso pagamento era gia' stato
    // contato. Non e' un guasto, ed e' importante NON risollevarlo: un errore
    // farebbe ritentare Stripe all'infinito su un evento in realta' concluso.
    if (error.code === "23505") {
      const { data } = await supabase
        .from("chat_widget_quota")
        .select("extra_widgets")
        .eq("property_id", dati.propertyId)
        .maybeSingle()
      return { applicato: false, giaRegistrato: true, extra: data?.extra_widgets ?? 0 }
    }
    throw new Error(`Registrazione acquisto widget fallita: ${error.message}`)
  }

  const extra = await incrementaWidgetExtra(dati.propertyId, quantita)
  return { applicato: true, giaRegistrato: false, extra }
}
