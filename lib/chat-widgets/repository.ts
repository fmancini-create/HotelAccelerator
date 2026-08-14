import "server-only"
import { randomBytes } from "node:crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { type WidgetAppearance, normalizzaAspetto } from "./appearance"

/**
 * Un widget chat = una riga di `messaging_channels` con `channel_type = 'chat'`.
 *
 * Non e' un dettaglio di comodo: e' la scelta che fa funzionare da subito le
 * basi di conoscenza per singolo widget (`channel_knowledge_bases.channel_id`
 * punta a `messaging_channels.id`), l'isolamento per struttura e l'invio dalla
 * conversazione giusta. Tenerli in `embed_scripts` avrebbe richiesto di
 * duplicare a mano il legame con le basi, che e' la parte piu' delicata.
 */
export interface ChatWidget {
  id: string
  propertyId: string
  /** Nome interno, per distinguerli nel pannello: "Sito hotel", "Sito ristorante". */
  name: string
  /** Sito su cui e' installato, solo informativo. */
  siteUrl: string | null
  /** Chiave usata nello snippet pubblico. */
  publicKey: string
  isActive: boolean
  appearance: WidgetAppearance
  createdAt: string
}

interface RigaCanale {
  id: string
  property_id: string
  display_name: string | null
  is_active: boolean
  config: Record<string, unknown> | null
  created_at: string
}

function rigaAWidget(r: RigaCanale): ChatWidget {
  const config = r.config ?? {}
  return {
    id: r.id,
    propertyId: r.property_id,
    name: r.display_name?.trim() || "Widget senza nome",
    siteUrl: typeof config.site_url === "string" && config.site_url.trim() ? String(config.site_url).trim() : null,
    publicKey: String(config.public_key ?? ""),
    isActive: r.is_active,
    appearance: normalizzaAspetto(config.appearance),
    createdAt: r.created_at,
  }
}

/**
 * Chiave pubblica del widget.
 *
 * Lo snippet vive su un sito pubblico, quindi la chiave e' visibile a chiunque:
 * per questo NON e' l'id interno del canale (che inviterebbe a tentare gli id
 * vicini) ma un valore casuale, revocabile rigenerandolo.
 */
export function generaChiavePubblica(): string {
  return `wk_${randomBytes(18).toString("base64url")}`
}

export async function listChatWidgets(propertyId: string): Promise<ChatWidget[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("messaging_channels")
    .select("id, property_id, display_name, is_active, config, created_at")
    .eq("property_id", propertyId)
    .eq("channel_type", "chat")
    .order("created_at", { ascending: true })

  if (error) throw new Error(`Lettura widget fallita: ${error.message}`)
  return ((data ?? []) as RigaCanale[]).map(rigaAWidget)
}

/** Un widget della struttura indicata. Il filtro su property_id non e' ridondante:
 *  senza di esso un id indovinato leggerebbe il widget di un altro hotel. */
export async function getChatWidget(widgetId: string, propertyId: string): Promise<ChatWidget | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("messaging_channels")
    .select("id, property_id, display_name, is_active, config, created_at")
    .eq("id", widgetId)
    .eq("property_id", propertyId)
    .eq("channel_type", "chat")
    .maybeSingle()

  if (error || !data) return null
  return rigaAWidget(data as RigaCanale)
}

/** Risoluzione dalla chiave pubblica: la usa il sito del cliente. */
export async function getChatWidgetByPublicKey(publicKey: string): Promise<ChatWidget | null> {
  if (!publicKey || !publicKey.startsWith("wk_")) return null
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("messaging_channels")
    .select("id, property_id, display_name, is_active, config, created_at")
    .eq("channel_type", "chat")
    .eq("config->>public_key", publicKey)
    .maybeSingle()

  if (error || !data) return null
  return rigaAWidget(data as RigaCanale)
}

export interface NuovoWidget {
  name: string
  siteUrl?: string | null
  appearance?: Partial<WidgetAppearance>
}

export async function createChatWidget(propertyId: string, dati: NuovoWidget): Promise<ChatWidget> {
  const supabase = createServiceClient()
  const aspetto = normalizzaAspetto(dati.appearance)
  const { data, error } = await supabase
    .from("messaging_channels")
    .insert({
      property_id: propertyId,
      channel_type: "chat",
      display_name: dati.name.trim().slice(0, 80) || "Nuovo widget",
      is_active: true,
      config: {
        public_key: generaChiavePubblica(),
        site_url: dati.siteUrl?.trim() || null,
        appearance: aspetto,
      },
    })
    .select("id, property_id, display_name, is_active, config, created_at")
    .single()

  if (error || !data) throw new Error(`Creazione widget fallita: ${error?.message ?? "nessun dato"}`)
  return rigaAWidget(data as RigaCanale)
}

export interface ModificaWidget {
  name?: string
  siteUrl?: string | null
  isActive?: boolean
  appearance?: Partial<WidgetAppearance>
}

export async function updateChatWidget(
  widgetId: string,
  propertyId: string,
  patch: ModificaWidget,
): Promise<ChatWidget> {
  const supabase = createServiceClient()
  const attuale = await getChatWidget(widgetId, propertyId)
  if (!attuale) throw new Error("Widget non trovato")

  // La configurazione si RIscrive intera partendo da quella attuale: scrivere
  // solo i campi cambiati su una colonna jsonb sovrascriverebbe il resto.
  const config: Record<string, unknown> = {
    public_key: attuale.publicKey || generaChiavePubblica(),
    site_url: patch.siteUrl !== undefined ? patch.siteUrl?.trim() || null : attuale.siteUrl,
    appearance: patch.appearance ? normalizzaAspetto({ ...attuale.appearance, ...patch.appearance }) : attuale.appearance,
  }

  const aggiornamento: Record<string, unknown> = { config, updated_at: new Date().toISOString() }
  if (patch.name !== undefined) aggiornamento.display_name = patch.name.trim().slice(0, 80) || attuale.name
  if (patch.isActive !== undefined) aggiornamento.is_active = patch.isActive

  const { data, error } = await supabase
    .from("messaging_channels")
    .update(aggiornamento)
    .eq("id", widgetId)
    .eq("property_id", propertyId)
    .eq("channel_type", "chat")
    .select("id, property_id, display_name, is_active, config, created_at")
    .single()

  if (error || !data) throw new Error(`Modifica widget fallita: ${error?.message ?? "nessun dato"}`)
  return rigaAWidget(data as RigaCanale)
}

/** Rigenera la chiave: serve se lo snippet e' finito dove non doveva.
 *  Da quel momento il vecchio snippet smette di funzionare, ed e' l'intento. */
export async function rigeneraChiaveWidget(widgetId: string, propertyId: string): Promise<ChatWidget> {
  const supabase = createServiceClient()
  const attuale = await getChatWidget(widgetId, propertyId)
  if (!attuale) throw new Error("Widget non trovato")

  const { data, error } = await supabase
    .from("messaging_channels")
    .update({
      config: {
        public_key: generaChiavePubblica(),
        site_url: attuale.siteUrl,
        appearance: attuale.appearance,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", widgetId)
    .eq("property_id", propertyId)
    .eq("channel_type", "chat")
    .select("id, property_id, display_name, is_active, config, created_at")
    .single()

  if (error || !data) throw new Error(`Rigenerazione chiave fallita: ${error?.message ?? "nessun dato"}`)
  return rigaAWidget(data as RigaCanale)
}

export async function deleteChatWidget(widgetId: string, propertyId: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from("messaging_channels")
    .delete()
    .eq("id", widgetId)
    .eq("property_id", propertyId)
    .eq("channel_type", "chat")
  if (error) throw new Error(`Eliminazione widget fallita: ${error.message}`)
}

/** Conversazioni per widget: nel pannello dice quali widget vengono davvero usati. */
export async function conteggioConversazioniPerWidget(
  propertyId: string,
  widgetIds: string[],
): Promise<Record<string, number>> {
  if (widgetIds.length === 0) return {}
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("conversations")
    .select("metadata")
    .eq("property_id", propertyId)
    .eq("channel", "chat")
  if (error || !data) return {}

  const conteggi: Record<string, number> = {}
  for (const riga of data as { metadata: Record<string, unknown> | null }[]) {
    const id = riga.metadata?.messaging_channel_id
    if (typeof id === "string" && widgetIds.includes(id)) {
      conteggi[id] = (conteggi[id] ?? 0) + 1
    }
  }
  return conteggi
}
