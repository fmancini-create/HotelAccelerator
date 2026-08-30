import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  ConversationListItem,
  ConversationDetail,
  ConversationListOptions,
  MessageItem,
} from "@/lib/types/inbox-read.types"
import { RateLimitError } from "@/lib/errors"
import { buildPreview } from "@/lib/inbox/html-to-preview"
import {
  SENZA_CARTELLA,
  condizioniCartelleNascoste,
  type CartelleNascoste,
} from "@/lib/inbox/folder-visibility"

function handleSupabaseError(error: any): never {
  if (error && typeof error === "object") {
    const message = error.message || String(error)
    if (
      message.toLowerCase().includes("too many") ||
      message.toLowerCase().includes("rate limit") ||
      error.code === "429" ||
      error.status === 429
    ) {
      throw new RateLimitError()
    }
  }
  if (typeof error === "string" && error.toLowerCase().includes("too many")) {
    throw new RateLimitError()
  }
  throw error
}

/**
 * Quanti id si possono mettere in un solo indirizzo.
 *
 * Ogni uuid pesa 37 caratteri nell'indirizzo: 400 id fanno 15.018 caratteri e
 * la richiesta muore con `UND_ERR_HEADERS_OVERFLOW` prima di partire (misurato:
 * 300 id = 11.318 caratteri passano, 400 no). 150 tiene l'indirizzo intorno ai
 * 5.700 caratteri, con margine ampio anche se un domani si aggiungono filtri.
 */
const ID_PER_LOTTO = 150

function inLotti<T>(elenco: T[], dimensione = ID_PER_LOTTO): T[][] {
  const lotti: T[][] = []
  for (let i = 0; i < elenco.length; i += dimensione) {
    lotti.push(elenco.slice(i, i + dimensione))
  }
  return lotti
}

/**
 * Pull the bare address out of a From header.
 *
 * Headers arrive as `"Villa I Barronci Resort & Spa" <reservation@scidoo.com>`,
 * and the display name must not be matched against: a hotel-branded name on an
 * automated address would read like a human sender.
 */
function extractAddress(from: unknown): string | null {
  if (typeof from !== "string" || !from) return null
  const angled = from.match(/<([^>]+)>/)
  const candidate = (angled ? angled[1] : from).trim().toLowerCase()
  return candidate.includes("@") ? candidate : null
}

/**
 * Normalise the embedded contact into the shape the UI expects.
 *
 * Conversations from automated senders have no CRM contact on purpose. Their
 * sender lives in the denormalised `contact_email` / `contact_name` columns, so
 * a synthetic contact (with a null id, which marks it as "not in the CRM") is
 * returned instead of leaving the row without a sender to display.
 */
function resolveContact(conv: any) {
  const embedded = Array.isArray(conv.contact) ? conv.contact[0] : conv.contact
  if (embedded) return embedded
  if (!conv.contact_email && !conv.contact_name) return null
  return {
    id: null,
    email: conv.contact_email ?? null,
    name: conv.contact_name ?? conv.contact_email ?? null,
    phone: null,
  }
}

export class InboxReadRepository {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Cartelle Gmail che l'utente ha spento, raggruppate per casella.
   *
   * Si leggono solo le righe spente: le cartelle mai toccate non hanno riga, e
   * "assente" deve valere "visibile" o aggiungere questa funzione avrebbe
   * svuotato l'inbox di tutti.
   */
  private async cartelleNascoste(propertyId: string): Promise<Map<string, CartelleNascoste>> {
    const { data, error } = await this.supabase
      .from("email_labels")
      .select("channel_id, gmail_id")
      .eq("property_id", propertyId)
      .eq("visible_in_inbox", false)

    // Un errore qui non deve togliere l'inbox: senza questa informazione si
    // mostra tutto, che e' il comportamento di prima.
    if (error) return new Map()

    const perCasella = new Map<string, CartelleNascoste>()
    for (const riga of data || []) {
      if (!riga.channel_id) continue
      const voce = perCasella.get(riga.channel_id) ?? { etichette: [], senzaCartella: false }
      if (riga.gmail_id === SENZA_CARTELLA) voce.senzaCartella = true
      else voce.etichette.push(riga.gmail_id)
      perCasella.set(riga.channel_id, voce)
    }
    return perCasella
  }

  async listConversations(propertyId: string, options: ConversationListOptions = {}): Promise<ConversationListItem[]> {
    const { status = "open", channel, subchannel_id, limit = 50, offset = 0, search, mode = "smart", gmail_label, sort, access, ids } = options

    // Per-user channel access enforcement (restricted, non-admin users).
    // Build an OR filter so the user only sees conversations of their channels:
    //  - email:     conversations.channel_id IN (assigned email channels)
    //  - messaging: conversations.metadata->>messaging_channel_id IN (assigned)
    // Chat conversations have no resolvable channel link and are intentionally
    // not exposed to restricted users (admins still see everything).
    let restrictOrFilter: string | null = null
    if (access?.restrict) {
      const orParts: string[] = []
      if (access.emailChannelIds.length > 0) {
        orParts.push(`channel_id.in.(${access.emailChannelIds.join(",")})`)
      }
      if (access.messagingChannelIds.length > 0) {
        orParts.push(`metadata->>messaging_channel_id.in.(${access.messagingChannelIds.join(",")})`)
      }
      // No accessible channels -> nothing to show.
      if (orParts.length === 0) {
        return []
      }
      restrictOrFilter = orParts.join(",")
    }

    let query = this.supabase
      .from("conversations")
      .select(
        `
        id,
        subject,
        status,
        channel,
        is_starred,
        last_message_at,
        created_at,
        unread_count,
        booking_data,
        metadata,
        channel_id,
        gmail_thread_id,
        gmail_labels,
        contact_email,
        contact_name,
        contact:contacts(id, email, name, phone),
        assigned:admin_users(id, name, email)
      `,
      )
      .eq("property_id", propertyId)
      .range(offset, offset + limit - 1)

    if (ids && ids.length > 0) {
      // Conversazioni chieste per id (vista "Bozze"): si apre un messaggio che
      // puo' stare fuori dalla pagina caricata, in un altro stato o sotto un'altra
      // etichetta Gmail. Ne' lo stato ne' l'etichetta vanno applicati, o una bozza
      // su una conversazione risolta resterebbe irraggiungibile: comanda l'id.
      // Il filtro per struttura e quello per canali assegnati restano invariati,
      // quindi un id di un'altra struttura o di un canale non concesso non esce.
      query = query.in("id", ids)
    } else if (mode === "gmail") {
      // Gmail Mirror mode: filter by Gmail labels
      query = query.eq("channel", "email")

      if (gmail_label && gmail_label !== "ALL") {
        if (gmail_label === "STARRED") {
          query = query.eq("is_starred", true)
        } else if (gmail_label === "INBOX") {
          query = query.contains("gmail_labels", ["INBOX"])
        } else if (gmail_label === "SENT") {
          query = query.contains("gmail_labels", ["SENT"])
        } else if (gmail_label === "DRAFT") {
          query = query.contains("gmail_labels", ["DRAFT"])
        } else if (gmail_label === "SPAM") {
          query = query.or("status.eq.spam,gmail_labels.cs.{SPAM}")
        } else if (gmail_label === "TRASH") {
          query = query.contains("gmail_labels", ["TRASH"])
        }
      }
    } else {
      // Smart mode: filter by status
      if (status === "starred") {
        query = query.eq("is_starred", true)
      } else if (status !== "all") {
        query = query.eq("status", status)
      }
    }

    // Apply ordering. Default:
    //   smart -> legacy priority sort (unread first, then recent)
    //   gmail -> date_desc (Gmail-like)
    const effectiveSort = sort ?? (mode === "gmail" ? "date_desc" : "smart")

    if (effectiveSort === "smart") {
      query = query.order("unread_count", { ascending: false })
      query = query.order("last_message_at", { ascending: false })
    } else if (effectiveSort === "date_desc") {
      query = query.order("last_message_at", { ascending: false, nullsFirst: false })
    } else if (effectiveSort === "date_asc") {
      query = query.order("last_message_at", { ascending: true, nullsFirst: false })
    } else if (effectiveSort === "sender_asc") {
      // Sort on the denormalised sender, not on the embedded contact: ordering
      // by a left-joined table would drop contactless conversations out of
      // position (and, before the join was relaxed, out of the list entirely).
      query = query.order("contact_email", { ascending: true, nullsFirst: false })
      query = query.order("last_message_at", { ascending: false })
    } else if (effectiveSort === "sender_desc") {
      query = query.order("contact_email", { ascending: false, nullsFirst: false })
      query = query.order("last_message_at", { ascending: false })
    }

    if (channel && channel !== "all") {
      query = query.eq("channel", channel)
    }

    // A subchannel is a concrete configured account inside a channel. Email
    // conversations store it in channel_id; messaging providers store it in
    // metadata.messaging_channel_id. Never accept a browser-provided tenant id:
    // propertyId remains the first mandatory predicate and channel access stays
    // ANDed below, so a foreign or unassigned account returns zero rows.
    if (subchannel_id) {
      if (channel === "email") {
        query = query.eq("channel_id", subchannel_id)
      } else if (channel && ["whatsapp", "telegram"].includes(channel)) {
        query = query.eq("metadata->>messaging_channel_id", subchannel_id)
      } else {
        query = query.or(`channel_id.eq.${subchannel_id},metadata->>messaging_channel_id.eq.${subchannel_id}`)
      }
    }

    if (search) {
      // The sender is matched on the conversation's own columns. Referencing
      // the embedded `contact.*` inside a top-level OR only works while the
      // join is inner, and an inner join hides every conversation without a
      // CRM contact (all automated senders).
      const term = search.replace(/[,()"]/g, " ").trim()
      if (term) {
        const orParts = [
          `subject.ilike.%${term}%`,
          `contact_email.ilike.%${term}%`,
          `contact_name.ilike.%${term}%`,
        ]

        // A contact renamed in the CRM after the conversation was created no
        // longer matches the denormalised copy, so resolve matching contacts
        // separately and search by id as well.
        const { data: matchingContacts } = await this.supabase
          .from("contacts")
          .select("id")
          .eq("property_id", propertyId)
          .or(`name.ilike.%${term}%,email.ilike.%${term}%`)
          .limit(200)

        if (matchingContacts && matchingContacts.length > 0) {
          orParts.push(`contact_id.in.(${matchingContacts.map((c) => c.id).join(",")})`)
        }

        query = query.or(orParts.join(","))
      }
    }

    // Apply per-user channel restriction (ANDed with any other filters above).
    if (restrictOrFilter) {
      query = query.or(restrictOrFilter)
    }

    // Cartelle spente dall'utente. Si salta in due casi, perche' una richiesta
    // esplicita vale piu' di un nascondimento predefinito:
    //  - `ids`: si sta aprendo UNA conversazione per id (es. dalle bozze), e
    //    renderla irraggiungibile per la sua cartella sarebbe un vicolo cieco;
    //  - una cartella scelta a mano in modalita' Gmail: l'utente la sta
    //    guardando, quindi nasconderla renderebbe la voce inutilizzabile.
    const cartellaScelta = mode === "gmail" && gmail_label && gmail_label !== "ALL"
    if (!(ids && ids.length > 0) && !cartellaScelta) {
      const nascoste = await this.cartelleNascoste(propertyId)
      for (const condizione of condizioniCartelleNascoste(nascoste)) {
        // Un `.or()` per condizione: i gruppi si combinano in AND, mentre
        // unirli in uno solo li metterebbe in OR e non nasconderebbe nulla.
        query = query.or(condizione)
      }
    }

    const { data, error } = await query

    if (error) handleSupabaseError(error)

    const conversationIds = (data || []).map((c) => c.id)

    if (conversationIds.length === 0) {
      return []
    }

    const subjectById = new Map<string, string | null>((data || []).map((c) => [c.id as string, c.subject as string]))

    // Ultimo messaggio di ogni conversazione: a LOTTI e in DUE passaggi.
    //
    // Prima era una sola richiesta con tutti gli id nell'indirizzo e il corpo
    // incluso. Due guasti misurati su questi dati:
    //  - oltre ~300 id l'indirizzo superava il tetto degli header e la richiesta
    //    moriva (`UND_ERR_HEADERS_OVERFLOW`, visto come "fetch failed"): il
    //    limite di 300 non era una scelta di prodotto, era un incidente;
    //  - `content` e' il corpo grezzo dell'email, e si scaricava per OGNI
    //    messaggio di ogni conversazione: 3,8 MB per una pagina di 50 righe,
    //    quando serve una riga sola per conversazione.
    //
    // Passaggio 1, senza corpo: serve solo sapere QUALE messaggio e' l'ultimo.
    const ultimoPerConversazione = new Map<string, any>()
    for (const lotto of inLotti(conversationIds)) {
      const { data: leggeri, error: msgError } = await this.supabase
        .from("messages")
        .select("id, sender_type, created_at, conversation_id, metadata")
        .in("conversation_id", lotto)
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false })

      if (msgError) handleSupabaseError(msgError)

      for (const msg of leggeri || []) {
        // I messaggi arrivano dal piu' recente: il primo di ogni conversazione
        // e' il suo ultimo. L'ordine vale dentro il lotto, e ogni conversazione
        // sta in un lotto solo, quindi lo spezzettamento non altera l'esito.
        if (!ultimoPerConversazione.has(msg.conversation_id)) {
          ultimoPerConversazione.set(msg.conversation_id, msg)
        }
      }
    }

    // Passaggio 2: il corpo dei soli messaggi che finiscono davvero in elenco.
    const corpoPerMessaggio = new Map<string, string | null>()
    const idUltimi = Array.from(ultimoPerConversazione.values()).map((m) => m.id as string)
    for (const lotto of inLotti(idUltimi)) {
      const { data: corpi, error: corpoError } = await this.supabase
        .from("messages")
        .select("id, content")
        .in("id", lotto)
        .eq("property_id", propertyId)

      if (corpoError) handleSupabaseError(corpoError)
      for (const riga of corpi || []) corpoPerMessaggio.set(riga.id as string, riga.content as string | null)
    }

    const lastMessageMap = new Map()
    for (const [conversationId, msg] of ultimoPerConversazione) {
      lastMessageMap.set(conversationId, {
        id: msg.id,
        // In elenco serve una riga leggibile, non il documento HTML completo.
        preview: buildPreview(corpoPerMessaggio.get(msg.id as string) ?? null, subjectById.get(conversationId)),
        sender_type: msg.sender_type,
        created_at: msg.created_at,
        // Address the message actually came from. `conversations.contact_email`
        // is null on a few rows (3 of 6876 here, but Scidoo's booking mails
        // are among them), and there the "waiting for a reply" badge had no
        // address to judge and appeared on an automated sender.
        from_address: extractAddress((msg.metadata as any)?.from),
      })
    }

    // Resolve the origin account of each conversation (which mailbox / which
    // WhatsApp number). Email conversations point to email_channels via
    // channel_id; WhatsApp conversations carry messaging_channel_id in metadata.
    const emailChannelIds = new Set<string>()
    const messagingChannelIds = new Set<string>()
    for (const conv of data || []) {
      if (conv.channel === "email" && conv.channel_id) {
        emailChannelIds.add(conv.channel_id as string)
      }
      const mcid = (conv.metadata as any)?.messaging_channel_id
      if (mcid) messagingChannelIds.add(mcid as string)
    }

    const emailOriginMap = new Map<string, { label: string; detail?: string | null; color?: string | null }>()
    if (emailChannelIds.size > 0) {
      const { data: emailChannels } = await this.supabase
        .from("email_channels")
        .select("id, email_address, display_name, color")
        .in("id", Array.from(emailChannelIds))
      emailChannels?.forEach((ec) => {
        emailOriginMap.set(ec.id, {
          label: ec.email_address || ec.display_name || "Email",
          detail: ec.display_name && ec.display_name !== ec.email_address ? ec.display_name : null,
          color: ec.color ?? null,
        })
      })
    }

    const messagingOriginMap = new Map<string, { label: string; detail?: string | null; color?: string | null }>()
    if (messagingChannelIds.size > 0) {
      const { data: messagingChannels } = await this.supabase
        .from("messaging_channels")
        .select("id, display_name, channel_type, config")
        .in("id", Array.from(messagingChannelIds))
      messagingChannels?.forEach((mc) => {
        const phone = (mc.config as any)?.display_phone_number || null
        messagingOriginMap.set(mc.id, {
          label: mc.display_name || phone || "WhatsApp",
          detail: phone,
        })
      })
    }

    const resolveOrigin = (conv: any): ConversationListItem["origin"] => {
      if (conv.channel === "email" && conv.channel_id && emailOriginMap.has(conv.channel_id)) {
        const o = emailOriginMap.get(conv.channel_id)!
        return { type: "email", label: o.label, detail: o.detail ?? null, color: o.color ?? null }
      }
      const mcid = conv.metadata?.messaging_channel_id
      if (mcid && messagingOriginMap.has(mcid)) {
        const o = messagingOriginMap.get(mcid)!
        return { type: conv.channel || "whatsapp", label: o.label, detail: o.detail ?? null }
      }
      return null
    }

    return (data || []).map((conv) => ({
      ...conv,
      is_starred: conv.is_starred ?? false,
      contact: resolveContact(conv),
      assigned: Array.isArray(conv.assigned) ? conv.assigned[0] : conv.assigned,
      last_message: lastMessageMap.get(conv.id) || null,
      intelligence_summary: conv.metadata?.intelligence_summary || null,
      booking_data: conv.booking_data || null,
      gmail_thread_id: conv.gmail_thread_id || null,
      gmail_labels: conv.gmail_labels || null,
      origin: resolveOrigin(conv),
    })) as ConversationListItem[]
  }

  async getConversation(propertyId: string, conversationId: string): Promise<ConversationDetail | null> {
    const { data: conversation, error: convError } = await this.supabase
      .from("conversations")
      .select(
        `
        id,
        subject,
        status,
        channel,
        is_starred,
        last_message_at,
        created_at,
        property_id,
        unread_count,
        metadata,
        booking_data,
        gmail_thread_id,
        gmail_labels,
        contact_email,
        contact_name,
        contact:contacts(id, email, name, phone),
        assigned:admin_users(id, name, email)
      `,
      )
      .eq("id", conversationId)
      .eq("property_id", propertyId)
      .single()

    if (convError) handleSupabaseError(convError)
    if (!conversation) return null

    const { data: messages, error: msgError } = await this.supabase
      .from("messages")
      .select("id, content, sender_type, sender_id, created_at, metadata, gmail_id, received_at, status")
      .eq("conversation_id", conversationId)
      .eq("property_id", propertyId)
      .order("received_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })

    if (msgError) handleSupabaseError(msgError)

    return {
      ...conversation,
      is_starred: conversation.is_starred ?? false,
      contact: resolveContact(conversation),
      assigned: Array.isArray(conversation.assigned) ? conversation.assigned[0] : conversation.assigned,
      messages: (messages || []) as MessageItem[],
      priority: "normal",
      gmail_thread_id: conversation.gmail_thread_id || null,
      gmail_labels: conversation.gmail_labels || null,
    } as ConversationDetail
  }

  async countByStatus(propertyId: string): Promise<Record<string, number>> {
    const { data, error } = await this.supabase.from("conversations").select("status").eq("property_id", propertyId)

    if (error) handleSupabaseError(error)

    const counts: Record<string, number> = {}
    data?.forEach((row) => {
      counts[row.status] = (counts[row.status] || 0) + 1
    })

    return counts
  }
}
