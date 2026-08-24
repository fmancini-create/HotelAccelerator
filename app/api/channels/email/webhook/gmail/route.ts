import { type NextRequest, NextResponse, after } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/server"
import { EmailProcessor, formatEmailProcessingError } from "@/lib/email/email-processor"
import { parseGmailMessage } from "@/lib/email/gmail-parse"
import { getValidGmailToken, gmailFetchWithToken } from "@/lib/gmail-client"
import { verificaNotificaPubSub } from "@/lib/email/pubsub-verify"
import { processEmailAiTasks, type EmailAiTask } from "@/lib/ai/channels/email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const API_VERSION = "v790-durable-history-cursor"
const PROCESSING_BUDGET_MS = 42_000

type GmailChannel = {
  id: string
  property_id: string
  provider: string
  email_address: string | null
  oauth_access_token: string | null
  oauth_refresh_token: string | null
  oauth_expiry: string | null
  gmail_history_id: number | string | null
}

type HistorySyncResult = {
  complete: boolean
  retryable: boolean
  cursor: string
  messagesFound: number
  messagesInserted: number
  duplicates: number
  errors: string[]
  failureCode?: "GMAIL_RECONNECT_REQUIRED" | "HISTORY_CURSOR_EXPIRED" | "GMAIL_TEMPORARILY_UNAVAILABLE"
}

function decodeBase64UrlToString(input: string): string {
  if (!input) return ""
  let b64 = input.replace(/-/g, "+").replace(/_/g, "/")
  const pad = b64.length % 4
  if (pad) b64 += "=".repeat(4 - pad)
  return Buffer.from(b64, "base64").toString("utf-8")
}

function isHistoryAfter(candidate: string | number | null, current: string | number | null): boolean {
  if (candidate === null || candidate === undefined) return false
  if (current === null || current === undefined) return true
  try {
    return BigInt(candidate) > BigInt(current)
  } catch {
    return Number(candidate) > Number(current)
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    version: API_VERSION,
    timestamp: new Date().toISOString(),
  })
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()

  try {
    // Pub/Sub now sends a verified OIDC token. Authenticate before parsing a
    // potentially untrusted body or touching the database.
    const origine = await verificaNotificaPubSub(request)
    if (origine.stato !== "valida") {
      console.warn("[gmail-webhook][origine-rifiutata]", {
        stato: origine.stato,
        motivo: "motivo" in origine ? origine.motivo : undefined,
        aud: "aud" in origine ? origine.aud : undefined,
        iss: "iss" in origine ? origine.iss : undefined,
        bloccante: true,
      })
      return NextResponse.json({ error: "Notifica Pub/Sub non autorizzata" }, { status: 401 })
    }

    const body = await request.json()
    const message = body?.message
    if (!message?.data) {
      return new NextResponse(null, { status: 204 })
    }

    let notification: { emailAddress?: string; historyId?: string }
    try {
      notification = JSON.parse(decodeBase64UrlToString(message.data))
    } catch {
      return NextResponse.json({ error: "Payload Pub/Sub non valido" }, { status: 400 })
    }

    const emailAddress = notification.emailAddress?.trim().toLowerCase()
    const historyId = notification.historyId
    if (!emailAddress || !historyId) {
      return NextResponse.json({ error: "Notifica Gmail incompleta" }, { status: 400 })
    }

    console.info("[gmail-webhook][origine-verificata]", {
      stato: origine.stato,
      email: origine.email,
      aud: origine.aud,
      iss: origine.iss,
      casella: emailAddress,
      bloccante: true,
    })

    // Google Pub/Sub has no HotelAccelerator user cookie. A request-scoped SSR
    // client would be anonymous and subject to RLS, making channel/token lookup
    // fail silently. This dedicated server client never reaches the browser.
    const supabase = createServiceClient() as SupabaseClient
    const { data: channel, error: channelError } = await supabase
      .from("email_channels")
      .select(
        "id, property_id, provider, email_address, oauth_access_token, oauth_refresh_token, oauth_expiry, gmail_history_id",
      )
      .eq("email_address", emailAddress)
      .eq("provider", "gmail")
      .eq("push_enabled", true)
      .eq("is_active", true)
      .maybeSingle()

    if (channelError) {
      console.error("[gmail-webhook] channel lookup failed", { code: channelError.code })
      return retryResponse("DATABASE_UNAVAILABLE")
    }
    if (!channel) {
      // A notification for a disconnected/deleted mailbox must be acknowledged;
      // retrying can never make the channel reappear.
      return new NextResponse(null, { status: 204 })
    }

    if (!isHistoryAfter(historyId, channel.gmail_history_id)) {
      return NextResponse.json({ status: "already_processed", version: API_VERSION })
    }

    // Newly-received inbound emails to hand to the AI assistant. Populated
    // during the sync and processed AFTER the response, so knowledge retrieval
    // and reply generation never eat into the tight Gmail sync budget.
    const aiTasks: EmailAiTask[] = []
    after(async () => {
      try {
        await processEmailAiTasks(supabase, channel.id, channel.property_id, aiTasks)
      } catch (e) {
        console.error("[gmail-webhook] AI tasks failed", { message: e instanceof Error ? e.message : String(e) })
      }
    })

    const syncResult = await syncNewEmails(
      supabase,
      channel as GmailChannel,
      String(channel.gmail_history_id || "0"),
      String(historyId),
      startedAt,
      aiTasks,
    )

    // Advance only to a cursor whose preceding page was fully processed. On a
    // partial backlog this records safe progress and asks Pub/Sub to retry from
    // that cursor. On a message failure the cursor remains unchanged.
    if (isHistoryAfter(syncResult.cursor, channel.gmail_history_id)) {
      const cursorUpdated = await updateHistoryCursor(
        supabase,
        channel as GmailChannel,
        syncResult.cursor,
      )
      if (!cursorUpdated) return retryResponse("CURSOR_UPDATE_FAILED")
    }

    if (!syncResult.complete) {
      if (syncResult.failureCode === "HISTORY_CURSOR_EXPIRED") {
        await supabase
          .from("email_channels")
          .update({
            full_sync_status: "failed",
            full_sync_last_error: "Cursor Gmail scaduto: eseguire una sincronizzazione storica completa.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", channel.id)
      }

      console.warn("[gmail-webhook] sync incomplete; Pub/Sub retry requested", {
        channelId: channel.id,
        cursor: syncResult.cursor,
        errors: syncResult.errors.slice(0, 3),
      })
      return syncResult.retryable
        ? retryResponse(syncResult.failureCode || "SYNC_INCOMPLETE")
        : NextResponse.json({ status: "reconnect_required", version: API_VERSION })
    }

    console.info("[gmail-webhook] sync complete", {
      channelId: channel.id,
      cursor: syncResult.cursor,
      found: syncResult.messagesFound,
      inserted: syncResult.messagesInserted,
      duplicates: syncResult.duplicates,
      durationMs: Date.now() - startedAt,
    })

    return NextResponse.json({
      status: "ok",
      version: API_VERSION,
      imported: syncResult.messagesInserted,
      duplicates: syncResult.duplicates,
    })
  } catch (error) {
    console.error("[gmail-webhook] fatal", {
      message: error instanceof Error ? error.message : String(error),
    })
    return retryResponse("INTERNAL_ERROR")
  }
}

async function syncNewEmails(
  supabase: SupabaseClient,
  channel: GmailChannel,
  startHistoryId: string,
  endHistoryId: string,
  startedAt: number,
  aiTasks: EmailAiTask[],
): Promise<HistorySyncResult> {
  const result: HistorySyncResult = {
    complete: false,
    retryable: true,
    cursor: startHistoryId,
    messagesFound: 0,
    messagesInserted: 0,
    duplicates: 0,
    errors: [],
  }

  const tokenResult = await getValidGmailToken(channel.id, supabase)
  if (!tokenResult.token) {
    result.retryable = !tokenResult.reconnectRequired
    result.failureCode = result.retryable
      ? "GMAIL_TEMPORARILY_UNAVAILABLE"
      : "GMAIL_RECONNECT_REQUIRED"
    result.errors.push(tokenResult.error || "Token Gmail non disponibile")
    return result
  }
  const token = tokenResult.token

  let pageToken: string | null = null
  let latestMailboxCursor = endHistoryId
  const paginationStartHistoryId = startHistoryId

  do {
    const params = new URLSearchParams({
      // pageToken belongs to the original history query; keep its start cursor
      // stable while paginating. `result.cursor` tracks only durable progress.
      startHistoryId: paginationStartHistoryId,
      historyTypes: "messageAdded",
      maxResults: "25",
    })
    if (pageToken) params.set("pageToken", pageToken)

    const { data, error, status } = await gmailFetchWithToken(token, `history?${params}`)
    if (error || !data) {
      result.retryable = status !== 401
      result.failureCode =
        status === 401
          ? "GMAIL_RECONNECT_REQUIRED"
          : status === 404
            ? "HISTORY_CURSOR_EXPIRED"
            : "GMAIL_TEMPORARILY_UNAVAILABLE"
      result.errors.push(error || `Gmail history HTTP ${status}`)
      return result
    }

    latestMailboxCursor = String(data.historyId || latestMailboxCursor)
    const historyEntries: any[] = data.history || []
    const messageIds = new Set<string>()
    for (const entry of historyEntries) {
      for (const added of entry.messagesAdded || []) {
        if (added.message?.id && added.message?.labelIds?.includes("INBOX")) {
          messageIds.add(added.message.id)
        }
      }
    }

    result.messagesFound += messageIds.size
    const processor = new EmailProcessor(supabase)
    for (const messageId of messageIds) {
      if (Date.now() - startedAt >= PROCESSING_BUDGET_MS) {
        result.errors.push("History page deferred to Pub/Sub retry")
        return result
      }
      // Il tempo che resta prima di sfondare il budget: oltre quello
      // smettiamo di aspettare e lasciamo il messaggio al prossimo tentativo.
      const msRimasti = PROCESSING_BUDGET_MS - (Date.now() - startedAt)
      const processed = await conScadenza(
        fetchAndProcessMessage(processor, channel, token, messageId, aiTasks),
        msRimasti,
        { success: false, error: "Elaborazione oltre il tempo disponibile, rinviata al prossimo tentativo" },
      )
      if (!processed.success) {
        result.errors.push(`${messageId}: ${processed.error || "processing failed"}`)
        return result
      }
      if (processed.duplicate) result.duplicates++
      else result.messagesInserted++
    }

    // The page is durable only after every message on it succeeded.
    const lastEntryId = historyEntries.at(-1)?.id
    if (lastEntryId) result.cursor = String(lastEntryId)

    pageToken = data.nextPageToken || null
    if (pageToken && Date.now() - startedAt >= PROCESSING_BUDGET_MS) {
      result.errors.push("History backlog deferred to Pub/Sub retry")
      return result
    }
  } while (pageToken)

  result.cursor = latestMailboxCursor
  result.complete = true
  return result
}

/**
 * Limita un'attesa che altrimenti non ne avrebbe.
 *
 * Il budget di 42s viene controllato solo TRA un messaggio e l'altro: se una
 * singola elaborazione si blocca (l'8/8 il database era in affanno) nessuno la
 * interrompe, la funzione sfonda il limite di 60s e viene uccisa con un 504.
 * In quel caso non resta traccia dell'errore e il cursore non avanza: al
 * riavvio Pub/Sub ritenta lo stesso messaggio e si blocca di nuovo.
 *
 * Chiudendo noi entro il budget, invece, l'errore viene registrato e il
 * rinvio a Pub/Sub segue la stessa strada gia' prevista per il budget esaurito.
 * Nota: non possiamo annullare il lavoro gia' avviato, ma possiamo smettere di
 * aspettarlo.
 */
async function conScadenza<T>(promessa: Promise<T>, msDisponibili: number, alloScadere: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promessa,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(alloScadere), msDisponibili)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function fetchAndProcessMessage(
  processor: EmailProcessor,
  channel: GmailChannel,
  token: string,
  messageId: string,
  aiTasks: EmailAiTask[],
): Promise<{ success: boolean; duplicate?: boolean; error?: string }> {
  try {
    const { data, error } = await gmailFetchWithToken(token, `messages/${messageId}?format=full`)
    if (error || !data) return { success: false, error: error || "Messaggio Gmail non disponibile" }

    const parsed = parseGmailMessage(data)
    const processed = await processor.processInboundEmail(parsed, channel.id, channel.property_id)
    if (!processed.success) return { success: false, error: processed.error }

    // Enqueue for the AI assistant only genuinely new inbound emails that opened
    // or continued a conversation. Duplicates (re-seen during idempotent polling)
    // must never trigger a second reply.
    if (!processed.isDuplicate && processed.conversationId && parsed.body?.trim()) {
      aiTasks.push({
        conversationId: processed.conversationId,
        fromHeader: parsed.from,
        subject: parsed.subject,
        threadId: parsed.threadId,
        externalId: parsed.externalId,
        body: parsed.body,
        contentType: parsed.contentType,
      })
    }

    return { success: true, duplicate: Boolean(processed.isDuplicate) }
  } catch (error) {
    return { success: false, error: formatEmailProcessingError(error) }
  }
}

async function updateHistoryCursor(
  supabase: SupabaseClient,
  channel: GmailChannel,
  cursor: string,
): Promise<boolean> {
  const update = {
    gmail_history_id: cursor,
    last_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  let query = supabase.from("email_channels").update(update).eq("id", channel.id)
  query =
    channel.gmail_history_id === null
      ? query.is("gmail_history_id", null)
      : query.eq("gmail_history_id", channel.gmail_history_id)

  const { data, error } = await query.select("id").maybeSingle()
  if (error) {
    console.error("[gmail-webhook] cursor update failed", { channelId: channel.id, code: error.code })
    return false
  }
  if (data) return true

  // Concurrent notifications are normal. If another invocation already moved
  // the cursor at least this far, this invocation is also complete.
  const { data: current, error: readError } = await supabase
    .from("email_channels")
    .select("gmail_history_id")
    .eq("id", channel.id)
    .maybeSingle()
  return !readError && !isHistoryAfter(cursor, current?.gmail_history_id ?? null)
}

function retryResponse(code: string) {
  return NextResponse.json(
    { status: "retry", code, version: API_VERSION },
    { status: 503, headers: { "Retry-After": "15" } },
  )
}
