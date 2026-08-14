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
