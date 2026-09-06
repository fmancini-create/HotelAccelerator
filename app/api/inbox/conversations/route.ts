import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getChannelAccess, getAccessibleChannelIds } from "@/lib/channel-access"
import { InboxReadService } from "@/lib/platform-services"
import type { ConversationListOptions, GmailLabel, InboxSort } from "@/lib/types/inbox-read.types"
import { handleServiceError } from "@/lib/errors"
import {
  expandInboxSearchQuery,
  shouldEnableFuzzySearch,
  shouldTrySemanticExpansion,
} from "@/lib/inbox/google-search-query"
import { buildSearchSnippet } from "@/lib/inbox/search-snippet"

export const runtime = "nodejs"
export const maxDuration = 15

const ALLOWED_SORTS: InboxSort[] = ["smart", "date_desc", "date_asc", "sender_asc", "sender_desc"]
const LIMITE_MASSIMO = 1000
const LIMITE_PREDEFINITO = 50
const RICERCA_ID_PER_LOTTO = 125
const RICERCA_TESTO_MASSIMO = 300

type GoogleSearchRow = {
  conversation_id?: string | null
  search_rank?: number | null
  matched_message_id?: string | null
  match_kind?: "keyword" | "fuzzy" | "semantic_expansion" | null
  match_quality?: number | null
}

type LegacySearchRow = {
  conversation_id?: string | null
  search_rank?: number | null
}

type SearchEngine = "google_hybrid" | "postgres_fts" | "legacy"

function isMissingRpc(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST202" || error?.code === "42883"
}

function risolviLimite(grezzo: string | null): { richiesto: number | null; applicato: number; troncato: boolean } {
  const numero = Number(grezzo)
  const valido = grezzo !== null && grezzo.trim() !== "" && Number.isFinite(numero) && Math.floor(numero) >= 1

  if (!valido) {
    return {
      richiesto: grezzo === null || grezzo.trim() === "" ? null : Number.isFinite(numero) ? numero : null,
      applicato: LIMITE_PREDEFINITO,
      troncato: false,
    }
  }

  const richiesto = Math.floor(numero)
  return {
    richiesto,
    applicato: Math.min(richiesto, LIMITE_MASSIMO),
    troncato: richiesto > LIMITE_MASSIMO,
  }
}

function interoNonNegativo(grezzo: string | null): number {
  const numero = Number(grezzo)
  if (grezzo === null || grezzo.trim() === "" || !Number.isFinite(numero)) return 0
  return Math.max(0, Math.floor(numero))
}

function normalizzaRicerca(grezzo: string | null): string | undefined {
  const testo = grezzo?.trim().replace(/\s+/g, " ")
  if (!testo) return undefined
  return testo.slice(0, RICERCA_TESTO_MASSIMO)
}

function inLotti<T>(elenco: T[], dimensione: number): T[][] {
  const risultato: T[][] = []
  for (let indice = 0; indice < elenco.length; indice += dimensione) {
    risultato.push(elenco.slice(indice, indice + dimensione))
  }
  return risultato
}

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()
    const service = new InboxReadService(supabase)
    const { searchParams } = new URL(request.url)

    const mode = (searchParams.get("mode") as "smart" | "gmail") || "smart"
    const gmailLabel = searchParams.get("gmail_label") as GmailLabel | null
    const rawSort = searchParams.get("sort") as InboxSort | null
    const sort: InboxSort | undefined = rawSort && ALLOWED_SORTS.includes(rawSort) ? rawSort : undefined

    const channelAccess = await getChannelAccess(request)
    let access: ConversationListOptions["access"] | undefined
    if (!channelAccess.isAdmin && channelAccess.adminUserId) {
      const ids = await getAccessibleChannelIds(channelAccess.supabase, propertyId, channelAccess.adminUserId)
      access = { restrict: true, ...ids }
    } else if (!channelAccess.isAdmin && !channelAccess.adminUserId) {
      access = { restrict: true, emailChannelIds: [], messagingChannelIds: [], chatChannelIds: [] }
    }

    const limite = risolviLimite(searchParams.get("limit"))
    const offset = interoNonNegativo(searchParams.get("offset"))
    const search = normalizzaRicerca(searchParams.get("search"))

    const options: ConversationListOptions = {
      status: (searchParams.get("status") as any) || "open",
      channel: (searchParams.get("channel") as any) || undefined,
      subchannel_id: searchParams.get("subchannel_id") || undefined,
      limit: limite.applicato,
      offset,
      search,
      ids: searchParams.get("ids")?.split(",").filter(Boolean) || undefined,
      filter: (searchParams.get("filter") as any) || undefined,
      mode,
      gmail_label: gmailLabel || undefined,
      sort,
      access,
    }

    // La query puo' contenere PII (nome ospite, email, codice prenotazione):
    // nei log entra solo la sua presenza/lunghezza, mai il testo.
    console.log("[Inbox] list conversations", {
      propertyId,
      mode,
      status: options.status,
      channel: options.channel ?? "all",
      subchannel: Boolean(options.subchannel_id),
      hasSearch: Boolean(search),
      searchLength: search?.length ?? 0,
      limit: limite.applicato,
      offset,
    })

    let conversations: Awaited<ReturnType<InboxReadService["listConversations"]>> = []
    let searchEngine: SearchEngine | undefined
    let googleRows: GoogleSearchRow[] = []
    let expandedTerms: string[] = []
    let semanticExpansionUsed = false
    const fuzzyEnabled = search ? shouldEnableFuzzySearch(search) : false

    const materializza = async (orderedIds: string[]) => {
      if (orderedIds.length === 0) return []
      const materializzate: Awaited<ReturnType<InboxReadService["listConversations"]>> = []

      for (const lotto of inLotti(orderedIds, RICERCA_ID_PER_LOTTO)) {
        const batch = await service.listConversations(propertyId, {
          ...options,
          ids: lotto,
          search: undefined,
          offset: 0,
          limit: lotto.length,
        })
        materializzate.push(...batch)
      }

      const posizione = new Map(orderedIds.map((id, index) => [id, index]))
      return materializzate.sort(
        (a, b) =>
          (posizione.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (posizione.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      )
    }

    if (search && !(options.ids && options.ids.length > 0)) {
      const googleArgs = (terms: string[]) => ({
        p_property_id: propertyId,
        p_search: search,
        p_expanded_terms: terms,
        p_enable_fuzzy: fuzzyEnabled,
        p_status: options.status || "open",
        p_mode: mode,
        p_gmail_label: gmailLabel || null,
        p_channel: options.channel || null,
        p_subchannel_id: options.subchannel_id || null,
        p_filter: options.filter || null,
        p_restrict: access?.restrict === true,
        p_email_channel_ids: access?.emailChannelIds || [],
        p_messaging_channel_ids: access?.messagingChannelIds || [],
        p_sort: sort ?? (mode === "gmail" ? "date_desc" : "smart"),
        p_limit: limite.applicato,
        p_offset: offset,
      })

      const fast = await supabase.rpc("search_inbox_google", googleArgs([]))
      if (fast.error && !isMissingRpc(fast.error)) throw fast.error

      if (!fast.error) {
        googleRows = (fast.data || []) as GoogleSearchRow[]
        searchEngine = "google_hybrid"

        const topQuality = googleRows.length > 0 ? Number(googleRows[0]?.match_quality ?? 0) : 0
        if (shouldTrySemanticExpansion(search, googleRows.length, topQuality)) {
          try {
            const expansion = await expandInboxSearchQuery(search)
            expandedTerms = expansion.terms

            if (expandedTerms.length > 0) {
              const enhanced = await supabase.rpc("search_inbox_google", googleArgs(expandedTerms))
              if (!enhanced.error) {
                googleRows = (enhanced.data || []) as GoogleSearchRow[]
                semanticExpansionUsed = true
              } else if (!isMissingRpc(enhanced.error)) {
                console.warn("[Inbox search] enhanced DB pass unavailable", { code: enhanced.error.code })
              }
            }
          } catch (error) {
            // L'AI e' solo query-understanding: timeout/provider/rate-limit non
            // possono trasformare una ricerca lessicale valida in errore 500.
            console.info("[Inbox search] semantic expansion skipped", {
              reason: error instanceof Error ? error.name : "unknown",
            })
            expandedTerms = []
          }
        }

        const orderedIds = googleRows
          .map((row) => row.conversation_id)
          .filter((id): id is string => Boolean(id))
        conversations = await materializza(orderedIds)

        const matchedIds = [...new Set(
          googleRows
            .map((row) => row.matched_message_id)
            .filter((id): id is string => Boolean(id)),
        )]
        const contentByMessage = new Map<string, string>()

        // Si scarica il corpo di UN solo messaggio selezionato per risultato,
        // non la conversazione intera: anche le mail HTML molto grandi restano
        // fuori dal percorso normale della lista.
        for (const lotto of inLotti(matchedIds, RICERCA_ID_PER_LOTTO)) {
          const { data: bodies, error: bodiesError } = await supabase
            .from("messages")
            .select("id, content")
            .eq("property_id", propertyId)
            .in("id", lotto)

          if (bodiesError) {
            console.warn("[Inbox search] snippet bodies unavailable", { code: bodiesError.code })
            break
          }
          for (const body of bodies || []) contentByMessage.set(body.id, body.content)
        }

        const matchByConversation = new Map(
          googleRows
            .filter((row) => row.conversation_id)
            .map((row) => [row.conversation_id as string, row]),
        )

        conversations = conversations.map((conversation) => {
          const match = matchByConversation.get(conversation.id)
          if (!match) return conversation

          const body = match.matched_message_id ? contentByMessage.get(match.matched_message_id) : undefined
          const snippet = body ? buildSearchSnippet(body, search, expandedTerms) : null

          return {
            ...conversation,
            // Compatibilita' immediata con la UI Inbox esistente: la riga gia'
            // renderizza last_message.preview. Durante la ricerca le mostriamo
            // il frammento pertinente, come fa un motore web, senza aspettare un
            // refactor grafico della lista.
            last_message:
              snippet?.text && conversation.last_message
                ? { ...conversation.last_message, preview: snippet.text }
                : conversation.last_message,
            search_match: {
              matched_message_id: match.matched_message_id ?? null,
              kind: match.match_kind ?? "keyword",
              score: Number(match.search_rank ?? 0),
              snippet: snippet?.text ?? null,
              highlights: snippet?.highlights ?? [],
              enhanced: semanticExpansionUsed,
            },
          }
        })
      } else {
        // Ambiente non ancora migrato: prima vecchia FTS indicizzata, poi solo
        // come ultimissima compatibilita' la ricerca legacy.
        const { data: ftsMatches, error: ftsError } = await supabase.rpc("search_inbox_conversation_ids", {
          p_property_id: propertyId,
          p_search: search,
          p_status: options.status || "open",
          p_mode: mode,
          p_gmail_label: gmailLabel || null,
          p_channel: options.channel || null,
          p_subchannel_id: options.subchannel_id || null,
          p_filter: options.filter || null,
          p_restrict: access?.restrict === true,
          p_email_channel_ids: access?.emailChannelIds || [],
          p_messaging_channel_ids: access?.messagingChannelIds || [],
          p_sort: sort ?? (mode === "gmail" ? "date_desc" : "smart"),
          p_limit: limite.applicato,
          p_offset: offset,
        })

        if (ftsError && !isMissingRpc(ftsError)) throw ftsError

        if (!ftsError) {
          searchEngine = "postgres_fts"
          const orderedIds = ((ftsMatches || []) as LegacySearchRow[])
            .map((row) => row.conversation_id)
            .filter((id): id is string => Boolean(id))
          conversations = await materializza(orderedIds)
        } else {
          searchEngine = "legacy"
          conversations = await service.listConversations(propertyId, options)
        }
      }
    } else {
      conversations = await service.listConversations(propertyId, options)
    }

    return NextResponse.json({
      conversations,
      ...(search
        ? {
            search: {
              query: search,
              engine: searchEngine || "legacy",
              fuzzy: fuzzyEnabled,
              semantic_expansion: semanticExpansionUsed,
            },
          }
        : {}),
      limite: {
        richiesto: limite.richiesto,
        applicato: limite.applicato,
        troncato: limite.troncato,
        massimo: LIMITE_MASSIMO,
      },
    })
  } catch (error) {
    return handleServiceError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()
    const body = await request.json()
    const { channel, contact_id, subject, metadata } = body

    let contactId = contact_id

    if (!contactId && body.contact) {
      const { data: existingContact } = await supabase
        .from("contacts")
        .select("id")
        .eq("property_id", propertyId)
        .or(`email.eq.${body.contact.email},phone.eq.${body.contact.phone}`)
        .single()

      if (existingContact) {
        contactId = existingContact.id
      } else {
        const { data: newContact, error: contactError } = await supabase
          .from("contacts")
          .insert({ ...body.contact, property_id: propertyId })
          .select()
          .single()

        if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 })
        contactId = newContact.id
      }
    }

    const { data: conversation, error } = await supabase
      .from("conversations")
      .insert({
        channel,
        contact_id: contactId,
        subject,
        metadata: metadata || {},
        property_id: propertyId,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ conversation })
  } catch (error) {
    return handleServiceError(error)
  }
}
