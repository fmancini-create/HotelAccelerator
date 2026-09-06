import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getChannelAccess, getAccessibleChannelIds } from "@/lib/channel-access"
import { InboxReadService } from "@/lib/platform-services"
import type { ConversationListOptions, GmailLabel, InboxSort } from "@/lib/types/inbox-read.types"

const ALLOWED_SORTS: InboxSort[] = ["smart", "date_desc", "date_asc", "sender_asc", "sender_desc"]
import { handleServiceError } from "@/lib/errors"

/** Quante conversazioni si possono chiedere al massimo (tetto di Supabase). */
const LIMITE_MASSIMO = 1000
const LIMITE_PREDEFINITO = 50
/** Evita query-string enormi quando gli id trovati dalla FTS vengono materializzati. */
const RICERCA_ID_PER_LOTTO = 125
/** Un input enorme non migliora la ricerca e puo' diventare lavoro inutile per Postgres. */
const RICERCA_TESTO_MASSIMO = 300

/**
 * Interpreta il numero di conversazioni richieste.
 *
 * Prima era `Number.parseInt(valore || "50")` senza alcun controllo, e i valori
 * assurdi passavano indisturbati (misurato su questa rotta):
 *  - `limit=abc` -> `NaN` -> **inbox vuota con esito 200**: il caso peggiore,
 *    perche' sembra "non hai messaggi" invece di segnalare un errore;
 *  - `limit=0` -> zero conversazioni, sempre con esito 200;
 *  - `limit=-5` -> **500**;
 *  - `limit=99999` -> 1000 conversazioni **senza dire** che l'elenco e' troncato.
 *
 * Un valore inservibile torna al predefinito invece di svuotare l'elenco: una
 * pagina di dimensione diversa e' un inconveniente, un'inbox vuota e' una bugia.
 */
function risolviLimite(grezzo: string | null): { richiesto: number | null; applicato: number; troncato: boolean } {
  const numero = Number(grezzo)
  const valido = grezzo !== null && grezzo.trim() !== "" && Number.isFinite(numero) && Math.floor(numero) >= 1

  if (!valido) {
    return { richiesto: grezzo === null || grezzo.trim() === "" ? null : Number.isFinite(numero) ? numero : null, applicato: LIMITE_PREDEFINITO, troncato: false }
  }

  const richiesto = Math.floor(numero)
  return {
    richiesto,
    applicato: Math.min(richiesto, LIMITE_MASSIMO),
    troncato: richiesto > LIMITE_MASSIMO,
  }
}

/** Scorrimento: un valore non valido o negativo parte dall'inizio, non rompe. */
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
    console.log("[v0] Inbox conversations API called")

    const propertyId = await getAuthenticatedPropertyId(request)
    console.log("[v0] Property ID:", propertyId)

    const supabase = await createClient()
    const service = new InboxReadService(supabase)

    const { searchParams } = new URL(request.url)

    const mode = (searchParams.get("mode") as "smart" | "gmail") || "smart"
    const gmailLabel = searchParams.get("gmail_label") as GmailLabel | null
    const rawSort = searchParams.get("sort") as InboxSort | null
    const sort: InboxSort | undefined =
      rawSort && ALLOWED_SORTS.includes(rawSort) ? rawSort : undefined

    // Resolve per-user channel access. Admins (super_admin / tenant admin) see
    // everything; restricted users only see conversations of their assigned channels.
    const channelAccess = await getChannelAccess(request)
    let access: ConversationListOptions["access"] | undefined
    if (!channelAccess.isAdmin && channelAccess.adminUserId) {
      const ids = await getAccessibleChannelIds(channelAccess.supabase, propertyId, channelAccess.adminUserId)
      access = { restrict: true, ...ids }
    } else if (!channelAccess.isAdmin && !channelAccess.adminUserId) {
      // Authenticated but unknown user (no admin_users record): show nothing.
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
      // Conversazioni precise, per aprire una bozza che sta fuori dalla pagina
      // caricata. Restano dentro `propertyId` e dentro `access`: chiedere un id
      // di un'altra struttura o di un canale non assegnato non restituisce nulla.
      ids: searchParams.get("ids")?.split(",").filter(Boolean) || undefined,
      filter: (searchParams.get("filter") as any) || undefined,
      mode,
      gmail_label: gmailLabel || undefined,
      sort,
      access,
    }

    console.log("[v0] Inbox options:", options)

    let conversations
    let searchEngine: "postgres_fts" | "legacy" | undefined

    // La ricerca testuale usa un indice GIN su oggetto, mittente, contatto e
    // contenuto di TUTTI i messaggi della conversazione. L'RPC applica prima
    // tenant, stato, canale, sottocanale, cartelle nascoste e permessi utente,
    // quindi gli id risultanti sono gia' uno spazio di ricerca autorizzato.
    // `ids` espliciti (es. apertura di una bozza) hanno precedenza sulla ricerca.
    if (search && !(options.ids && options.ids.length > 0)) {
      const { data: matches, error: searchError } = await supabase.rpc("search_inbox_conversation_ids", {
        p_property_id: propertyId,
        p_search: search,
        p_status: options.status || "open",
        p_mode: mode,
        p_gmail_label: gmailLabel || null,
        p_channel: options.channel || null,
        p_subchannel_id: options.subchannel_id || null,
        p_restrict: access?.restrict === true,
        p_email_channel_ids: access?.emailChannelIds || [],
        p_messaging_channel_ids: access?.messagingChannelIds || [],
        p_sort: sort ?? (mode === "gmail" ? "date_desc" : "smart"),
        p_limit: limite.applicato,
        p_offset: offset,
      })

      if (searchError) {
        // Solo ambienti in cui la migration non e' ancora arrivata degradano
        // alla ricerca precedente. Altri errori devono essere visibili: non si
        // nascondono problemi di auth/RLS/infrastruttura dietro risultati parziali.
        if (searchError.code === "PGRST202" || searchError.code === "42883") {
          console.warn("[Inbox search] FTS RPC unavailable; using legacy search", searchError.code)
          searchEngine = "legacy"
          conversations = await service.listConversations(propertyId, options)
        } else {
          throw searchError
        }
      } else {
        searchEngine = "postgres_fts"
        const orderedIds = (matches || [])
          .map((row: { conversation_id?: string | null }) => row.conversation_id)
          .filter((id: string | null | undefined): id is string => Boolean(id))

        if (orderedIds.length === 0) {
          conversations = []
        } else {
          // Il repository documenta un limite pratico per `.in(id, ...)` dovuto
          // alla dimensione degli header. Materializziamo gli id a lotti, poi
          // ricostruiamo l'ordine per rilevanza restituito dalla FTS.
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
          conversations = materializzate.sort(
            (a, b) => (posizione.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (posizione.get(b.id) ?? Number.MAX_SAFE_INTEGER),
          )
        }
      }
    } else {
      conversations = await service.listConversations(propertyId, options)
    }

    console.log("[v0] Found conversations:", conversations.length)

    // Il tetto va DICHIARATO, non subito in silenzio: chi chiede 5.000
    // conversazioni e ne riceve 1.000 deve poter sapere che l'elenco e'
    // troncato, altrimenti crede di vedere tutto.
    return NextResponse.json({
      conversations,
      ...(search ? { search: { query: search, engine: searchEngine || "legacy" } } : {}),
      limite: {
        richiesto: limite.richiesto,
        applicato: limite.applicato,
        troncato: limite.troncato,
        massimo: LIMITE_MASSIMO,
      },
    })
  } catch (error) {
    // handleServiceError distingue gia' le condizioni di auth attese (log
    // breve, 401) dai guasti veri (log con stack). Prima qui c'era un
    // console.error che emetteva uno stack completo su OGNI sessione scaduta:
    // un allarme sempre acceso, che seppellisce gli errori veri nel rumore.
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

        if (contactError) {
          return NextResponse.json({ error: contactError.message }, { status: 500 })
        }
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

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ conversation })
  } catch (error) {
    // Come nella GET: nessuno stack sulle sessioni scadute, che qui sono
    // altrettanto normali.
    return handleServiceError(error)
  }
}
