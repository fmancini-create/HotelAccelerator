import { type NextRequest, NextResponse } from "next/server"

import { accessErrorStatus, adminUserIdPerDatabase, requireTenantAdmin } from "@/lib/auth/admin-access"
import { classificaConversazione } from "@/lib/crm/date-requests"
import {
  analyzeSalesThread,
  type SalesAttributionAnalysis,
  type SalesOperatorIdentity,
  type SalesThreadMessage,
} from "@/lib/crm/sales-attribution"
import { parseGmailMessage } from "@/lib/email/gmail-parse"
import { gmailFetch } from "@/lib/gmail-client"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const SCAN_BATCH = 5

type ScanRequestRow = {
  id: string
  conversation_id: string | null
  stage: string | null
  stage_set_by: string | null
  stage_set_at: string | null
  quoted_rate_cents: number | null
  created_at: string | null
}

type ConversationRow = {
  id: string
  gmail_thread_id: string | null
  channel_id: string | null
  channel: string | null
  contact_email: string | null
  contact_name: string | null
  subject: string | null
}

type ReviewRow = {
  id: string
  date_request_id: string
  conversation_id: string | null
  user_id: string | null
  quote_sent_at: string | null
  closed_at: string | null
  amount_cents: number | null
  confidence: number
  verification_status: string
  evidence: Record<string, unknown> | null
  scanned_at: string
}

type UserLabel = { id: string; name: string | null; email: string | null }
type ConversationLabel = {
  id: string
  contact_name: string | null
  contact_email: string | null
  subject: string | null
}
type StatusRow = { verification_status: string }
type ExistingLockRow = {
  date_request_id: string
  attribution_source: string
  verified_by: string | null
}

function responseError(error: unknown, fallback: string) {
  const status = error && typeof error === "object" && "status" in error
    ? Number((error as { status?: number }).status) || 500
    : accessErrorStatus(error)
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status })
}

async function upsertScanResult(
  sb: ReturnType<typeof createServiceClient>,
  propertyId: string,
  requestRow: ScanRequestRow,
  conversationId: string | null,
  result: SalesAttributionAnalysis,
) {
  const now = new Date().toISOString()
  const { error } = await sb.from("crm_operator_sales_attributions").upsert(
    {
      property_id: propertyId,
      date_request_id: requestRow.id,
      conversation_id: conversationId,
      user_id: result.userId,
      quote_sent_at: result.quoteSentAt,
      closed_at: result.closedAt,
      amount_cents: result.amountCents,
      attribution_source: result.source,
      confidence: result.confidence,
      verification_status: result.verificationStatus,
      quote_message_id: result.quoteMessageId,
      close_message_id: result.closeMessageId,
      evidence: result.evidence,
      scanned_at: now,
      updated_at: now,
    },
    { onConflict: "property_id,date_request_id" },
  )
  if (error) throw error
}

async function markUnattributed(
  sb: ReturnType<typeof createServiceClient>,
  propertyId: string,
  requestRow: ScanRequestRow,
  conversationId: string | null,
  reason: string,
) {
  const now = new Date().toISOString()
  const { error } = await sb.from("crm_operator_sales_attributions").upsert(
    {
      property_id: propertyId,
      date_request_id: requestRow.id,
      conversation_id: conversationId,
      user_id: null,
      quote_sent_at: null,
      closed_at: null,
      amount_cents: requestRow.quoted_rate_cents,
      attribution_source: "gmail_scan",
      confidence: 0,
      verification_status: "unattributed",
      quote_message_id: null,
      close_message_id: null,
      evidence: { reason },
      scanned_at: now,
      updated_at: now,
    },
    { onConflict: "property_id,date_request_id" },
  )
  if (error) throw error
}

export async function GET(request: NextRequest) {
  try {
    const caller = await requireTenantAdmin(request)
    const sb = createServiceClient()

    const [allRequests, attributions, reviewRows] = await Promise.all([
      sb
        .from("contact_date_requests")
        .select("id", { count: "exact", head: true })
        .eq("property_id", caller.propertyId)
        .eq("source", "conversazione"),
      sb
        .from("crm_operator_sales_attributions")
        .select("verification_status")
        .eq("property_id", caller.propertyId)
        .limit(10000),
      sb
        .from("crm_operator_sales_attributions")
        .select(
          "id,date_request_id,conversation_id,user_id,quote_sent_at,closed_at,amount_cents,confidence,verification_status,evidence,scanned_at",
        )
        .eq("property_id", caller.propertyId)
        .eq("verification_status", "needs_review")
        .order("scanned_at", { ascending: false })
        .limit(50),
    ])
    if (allRequests.error) throw allRequests.error
    if (attributions.error) throw attributions.error
    if (reviewRows.error) throw reviewRows.error

    const statusRows = (attributions.data ?? []) as StatusRow[]
    const rows = (reviewRows.data ?? []) as ReviewRow[]
    const statuses = { confirmed: 0, needs_review: 0, unattributed: 0, rejected: 0 }
    for (const row of statusRows) {
      const key = row.verification_status as keyof typeof statuses
      if (key in statuses) statuses[key] += 1
    }

    const userIds = [...new Set(rows.map((row: ReviewRow) => row.user_id).filter(Boolean))] as string[]
    const conversationIds = [...new Set(rows.map((row: ReviewRow) => row.conversation_id).filter(Boolean))] as string[]

    let userRows: UserLabel[] = []
    if (userIds.length) {
      const { data, error } = await sb
        .from("admin_users")
        .select("id,name,email")
        .eq("property_id", caller.propertyId)
        .in("id", userIds)
      if (error) throw error
      userRows = (data ?? []) as UserLabel[]
    }

    let conversationLabelRows: ConversationLabel[] = []
    if (conversationIds.length) {
      const { data, error } = await sb
        .from("conversations")
        .select("id,contact_name,contact_email,subject")
        .eq("property_id", caller.propertyId)
        .in("id", conversationIds)
      if (error) throw error
      conversationLabelRows = (data ?? []) as ConversationLabel[]
    }

    const users = new Map<string, UserLabel>(userRows.map((user: UserLabel) => [user.id, user]))
    const conversations = new Map<string, ConversationLabel>(
      conversationLabelRows.map((conversation: ConversationLabel) => [conversation.id, conversation]),
    )

    return NextResponse.json({
      summary: {
        totalRequests: allRequests.count ?? 0,
        scanned: statusRows.length,
        unscanned: Math.max(0, (allRequests.count ?? 0) - statusRows.length),
        ...statuses,
      },
      review: rows.map((row: ReviewRow) => {
        const user = row.user_id ? users.get(row.user_id) : null
        const conversation = row.conversation_id ? conversations.get(row.conversation_id) : null
        return {
          ...row,
          operatorName: user?.name ?? user?.email ?? null,
          contactName: conversation?.contact_name ?? conversation?.contact_email ?? null,
          subject: conversation?.subject ?? null,
        }
      }),
    })
  } catch (error) {
    return responseError(error, "Impossibile leggere le attribuzioni commerciali")
  }
}

function countAnalysis(
  result: SalesAttributionAnalysis,
  counters: { confirmed: number; review: number; unattributed: number },
) {
  if (result.verificationStatus === "confirmed") counters.confirmed += 1
  else if (result.verificationStatus === "needs_review") counters.review += 1
  else counters.unattributed += 1
}

export async function POST(request: NextRequest) {
  try {
    const caller = await requireTenantAdmin(request)
    const body = (await request.json().catch(() => ({}))) as { offset?: unknown }
    const offset = typeof body.offset === "number" && Number.isInteger(body.offset) && body.offset >= 0 ? body.offset : 0
    const sb = createServiceClient()

    const [{ data: property, error: propertyError }, { data: operatorRows, error: operatorError }, requests] =
      await Promise.all([
        sb.from("properties").select("domain,custom_domain").eq("id", caller.propertyId).maybeSingle(),
        sb
          .from("admin_users")
          .select("id,email,name,signature,signature_html")
          .eq("property_id", caller.propertyId),
        sb
          .from("contact_date_requests")
          .select("id,conversation_id,stage,stage_set_by,stage_set_at,quoted_rate_cents,created_at", { count: "exact" })
          .eq("property_id", caller.propertyId)
          .eq("source", "conversazione")
          .order("created_at", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true })
          .range(offset, offset + SCAN_BATCH - 1),
      ])
    if (propertyError) throw propertyError
    if (operatorError) throw operatorError
    if (requests.error) throw requests.error

    const batch = (requests.data ?? []) as ScanRequestRow[]
    const conversationIds = [...new Set(batch.map((row) => row.conversation_id).filter(Boolean))] as string[]

    let conversationRows: ConversationRow[] = []
    if (conversationIds.length) {
      const { data, error } = await sb
        .from("conversations")
        .select("id,gmail_thread_id,channel_id,channel,contact_email,contact_name,subject")
        .eq("property_id", caller.propertyId)
        .in("id", conversationIds)
      if (error) throw error
      conversationRows = (data ?? []) as ConversationRow[]
    }

    let existingRows: ExistingLockRow[] = []
    if (batch.length) {
      const { data, error } = await sb
        .from("crm_operator_sales_attributions")
        .select("date_request_id,attribution_source,verified_by")
        .eq("property_id", caller.propertyId)
        .in("date_request_id", batch.map((row) => row.id))
      if (error) throw error
      existingRows = (data ?? []) as ExistingLockRow[]
    }

    const conversations = new Map<string, ConversationRow>(
      conversationRows.map((conversation: ConversationRow) => [conversation.id, conversation]),
    )
    const locked = new Set<string>(
      existingRows
        .filter((row: ExistingLockRow) => row.attribution_source === "manual" || Boolean(row.verified_by))
        .map((row: ExistingLockRow) => row.date_request_id),
    )
    const operators = (operatorRows ?? []) as SalesOperatorIdentity[]
    const tenantDomain = property?.domain ?? property?.custom_domain ?? null

    let scanned = 0
    const counters = { confirmed: 0, review: 0, unattributed: 0 }
    let skippedLocked = 0
    let errors = 0

    for (const row of batch) {
      if (locked.has(row.id)) {
        skippedLocked += 1
        continue
      }

      const conversation = row.conversation_id ? conversations.get(row.conversation_id) : null
      const pipeline = {
        stage: row.stage,
        stageSetBy: row.stage_set_by,
        stageSetAt: row.stage_set_at,
        quotedRateCents: row.quoted_rate_cents,
      }

      try {
        if (!conversation) {
          const result = analyzeSalesThread([], operators, pipeline)
          await upsertScanResult(sb, caller.propertyId, row, row.conversation_id, result)
          countAnalysis(result, counters)
          scanned += 1
          continue
        }

        const classification = classificaConversazione(
          { contact_email: conversation.contact_email, subject: conversation.subject },
          tenantDomain,
        )
        if (classification !== "lavorabile") {
          await markUnattributed(sb, caller.propertyId, row, conversation.id, `excluded_${classification}`)
          counters.unattributed += 1
          scanned += 1
          continue
        }

        if (conversation.channel !== "email" || !conversation.gmail_thread_id || !conversation.channel_id) {
          const result = analyzeSalesThread([], operators, pipeline)
          await upsertScanResult(sb, caller.propertyId, row, conversation.id, result)
          countAnalysis(result, counters)
          scanned += 1
          continue
        }

        const gmail = await gmailFetch(
          conversation.channel_id,
          `threads/${encodeURIComponent(conversation.gmail_thread_id)}?format=full`,
          {},
          sb,
        )
        if (gmail.error || !gmail.data) {
          // Se esiste almeno una decisione umana finale, conserviamo un candidato
          // da verificare invece di perdere del tutto l'attribuzione. Un rerun del
          // backfill potrà poi sostituirlo con l'autore reale del preventivo.
          if ((row.stage === "confermata" || row.stage === "persa") && row.stage_set_by) {
            const result = analyzeSalesThread([], operators, pipeline)
            await upsertScanResult(sb, caller.propertyId, row, conversation.id, result)
            countAnalysis(result, counters)
            scanned += 1
          } else {
            errors += 1
          }
          continue
        }

        const messages: SalesThreadMessage[] = (gmail.data.messages ?? []).map((raw: any) => {
          const parsed = parseGmailMessage(raw)
          return {
            id: raw.id,
            labels: parsed.labelIds ?? [],
            from: parsed.from,
            subject: parsed.subject,
            body: parsed.body,
            occurredAt: parsed.receivedAt.toISOString(),
          }
        })
        const result = analyzeSalesThread(messages, operators, pipeline)
        await upsertScanResult(sb, caller.propertyId, row, conversation.id, result)
        countAnalysis(result, counters)
        scanned += 1
      } catch (error) {
        errors += 1
        console.error("[sales-attribution] scan row failed", {
          propertyId: caller.propertyId,
          dateRequestId: row.id,
          error: error instanceof Error ? error.message : "unknown",
        })
      }
    }

    const total = requests.count ?? 0
    const nextOffset = offset + batch.length
    return NextResponse.json({
      done: nextOffset >= total,
      offset,
      nextOffset,
      total,
      batch: batch.length,
      scanned,
      confirmed: counters.confirmed,
      review: counters.review,
      unattributed: counters.unattributed,
      skippedLocked,
      errors,
    })
  } catch (error) {
    return responseError(error, "Impossibile analizzare lo storico commerciale")
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const caller = await requireTenantAdmin(request)
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body.id !== "string") {
      return NextResponse.json({ error: "Attribuzione non indicata" }, { status: 400 })
    }

    const allowed = new Set(["confirmed", "needs_review", "unattributed", "rejected"])
    if (typeof body.verificationStatus !== "string" || !allowed.has(body.verificationStatus)) {
      return NextResponse.json({ error: "Stato di verifica non valido" }, { status: 400 })
    }

    const userId = typeof body.userId === "string" && body.userId ? body.userId : null
    if (body.verificationStatus === "confirmed" && !userId) {
      return NextResponse.json({ error: "Per confermare serve un operatore" }, { status: 400 })
    }

    const sb = createServiceClient()
    if (userId) {
      const { data: user, error: userError } = await sb
        .from("admin_users")
        .select("id")
        .eq("property_id", caller.propertyId)
        .eq("id", userId)
        .maybeSingle()
      if (userError) throw userError
      if (!user) return NextResponse.json({ error: "Operatore non trovato nel tenant" }, { status: 404 })
    }

    let amountCents: number | null | undefined
    if ("amountCents" in body) {
      amountCents = body.amountCents === null ? null : Number(body.amountCents)
      if (amountCents !== null && (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 100_000_000)) {
        return NextResponse.json({ error: "Valore della trattativa non valido" }, { status: 400 })
      }
    }

    const actorId = adminUserIdPerDatabase(caller.adminUserId)
    const now = new Date().toISOString()
    const updates: Record<string, unknown> = {
      user_id: userId,
      verification_status: body.verificationStatus,
      attribution_source: "manual",
      confidence: body.verificationStatus === "confirmed" ? 100 : 0,
      verified_by: actorId,
      verified_at: now,
      updated_at: now,
    }
    if (amountCents !== undefined) updates.amount_cents = amountCents

    if ("closedAt" in body) {
      if (body.closedAt === null) {
        updates.closed_at = null
      } else {
        const closedAt = new Date(String(body.closedAt))
        if (Number.isNaN(closedAt.getTime())) {
          return NextResponse.json({ error: "Data di chiusura non valida" }, { status: 400 })
        }
        updates.closed_at = closedAt.toISOString()
      }
    }

    const { data, error } = await sb
      .from("crm_operator_sales_attributions")
      .update(updates)
      .eq("property_id", caller.propertyId)
      .eq("id", body.id)
      .select("id,user_id,quote_sent_at,closed_at,amount_cents,confidence,verification_status")
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: "Attribuzione non trovata nel tenant" }, { status: 404 })

    return NextResponse.json({ attribution: data })
  } catch (error) {
    return responseError(error, "Impossibile aggiornare l'attribuzione commerciale")
  }
}
