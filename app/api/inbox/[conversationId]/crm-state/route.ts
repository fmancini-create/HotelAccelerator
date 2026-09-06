import { type NextRequest, NextResponse } from "next/server"
import { requireAreaApi } from "@/lib/auth/area-access"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"
import { handleServiceError } from "@/lib/errors"
import { richiediOperatore } from "@/lib/inbox/identity"
import { FASI, faseDi, notaEsitoIA, type FaseKey } from "@/lib/crm/date-requests"
import { syncPipelineSalesAttribution } from "@/lib/crm/sales-attribution-store"
import { registraCambioStatoCrm } from "@/lib/inbox/coassignment"

const APOLLO_STAGES = [
  { key: "new", label: "Nuovo" },
  { key: "linkedin_pending", label: "LinkedIn in attesa" },
  { key: "linkedin_connected", label: "LinkedIn collegato" },
  { key: "engaged", label: "Coinvolto" },
  { key: "email_followup", label: "Follow-up email" },
  { key: "qualified", label: "Qualificato" },
  { key: "won", label: "Vinto" },
  { key: "lost", label: "Perso" },
  { key: "paused", label: "In pausa" },
] as const

const APOLLO_STAGE_KEYS = new Set<string>(APOLLO_STAGES.map((stage) => stage.key))

function pipelineOptions() {
  return FASI.map((fase) => ({ key: fase.key, label: fase.etichetta, description: fase.descrizione }))
}

async function conversationContext(propertyId: string, conversationId: string) {
  const db = createServiceClient()
  const { data, error } = await db
    .from("conversations")
    .select("id,contact_id,contact_email,contact_name,subject")
    .eq("id", conversationId)
    .eq("property_id", propertyId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const { conversationId } = await params
    const db = createServiceClient()
    const conversation = await conversationContext(propertyId, conversationId)
    if (!conversation) return NextResponse.json({ error: "Conversazione non trovata" }, { status: 404 })

    // La pipeline richieste e' la fonte primaria quando la conversazione ha gia'
    // generato una richiesta commerciale. Non creiamo uno stato parallelo Inbox.
    const { data: requests, error: requestError } = await db
      .from("contact_date_requests")
      .select("id,stage,stage_set_at,quoted_rate_cents,outcome,requested_check_in,requested_check_out,created_at")
      .eq("property_id", propertyId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(10)
    if (requestError) throw new Error(requestError.message)

    if (requests?.length) {
      const primary = requests[0]
      return NextResponse.json({
        source: "date_request",
        record: {
          id: primary.id,
          stage: faseDi(primary),
          storedStage: primary.stage,
          stageSetAt: primary.stage_set_at,
          requestedCheckIn: primary.requested_check_in,
          requestedCheckOut: primary.requested_check_out,
          noteAi: notaEsitoIA(primary.outcome),
        },
        // Se una stessa conversazione contiene piu' richieste, lo dichiariamo:
        // il selettore modifica la piu' recente, mentre il CRM conserva tutte.
        relatedCount: requests.length,
        options: pipelineOptions(),
      })
    }

    let prospect: any = null
    if (conversation.contact_id) {
      const { data, error } = await db
        .from("crm_apollo_prospects")
        .select("id,sales_stage,full_name,organization_name,updated_at")
        .eq("property_id", propertyId)
        .eq("contact_id", conversation.contact_id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      prospect = data
    }

    if (!prospect && conversation.contact_email) {
      const normalizedEmail = String(conversation.contact_email).trim().toLowerCase()
      const { data, error } = await db
        .from("crm_apollo_prospects")
        .select("id,sales_stage,full_name,organization_name,updated_at")
        .eq("property_id", propertyId)
        .eq("email", normalizedEmail)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      prospect = data
    }

    if (prospect) {
      return NextResponse.json({
        source: "apollo_prospect",
        record: {
          id: prospect.id,
          stage: prospect.sales_stage ?? "new",
          name: prospect.full_name,
          organization: prospect.organization_name,
        },
        relatedCount: 1,
        options: APOLLO_STAGES,
      })
    }

    return NextResponse.json({
      source: "none",
      record: null,
      relatedCount: 0,
      options: [],
      message: "Questa conversazione non e' ancora collegata a una trattativa CRM.",
    })
  } catch (error) {
    return handleServiceError(error)
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const operatore = await richiediOperatore(request)
    if (operatore.propertyId !== propertyId) {
      return NextResponse.json({ error: "Tenant non coerente" }, { status: 403 })
    }

    const { conversationId } = await params
    const conversation = await conversationContext(propertyId, conversationId)
    if (!conversation) return NextResponse.json({ error: "Conversazione non trovata" }, { status: 404 })

    const body = await request.json().catch(() => null)
    const source = typeof body?.source === "string" ? body.source : ""
    const recordId = typeof body?.recordId === "string" ? body.recordId.trim() : ""
    const stage = typeof body?.stage === "string" ? body.stage.trim() : ""
    if (!source || !recordId || !stage) {
      return NextResponse.json({ error: "Stato CRM incompleto" }, { status: 400 })
    }

    const db = createServiceClient()
    const actionAt = new Date().toISOString()

    if (source === "date_request") {
      if (!FASI.some((fase) => fase.key === stage)) {
        return NextResponse.json({ error: "Fase CRM non valida" }, { status: 400 })
      }
      const { data: before, error: beforeError } = await db
        .from("contact_date_requests")
        .select("id,conversation_id,stage,outcome,quoted_rate_cents")
        .eq("id", recordId)
        .eq("property_id", propertyId)
        .eq("conversation_id", conversationId)
        .maybeSingle()
      if (beforeError) throw new Error(beforeError.message)
      if (!before) return NextResponse.json({ error: "Richiesta CRM non trovata" }, { status: 404 })

      const { data, error } = await db
        .from("contact_date_requests")
        .update({
          stage: stage as FaseKey,
          stage_set_by: operatore.titolare.adminUserId,
          stage_set_at: actionAt,
        })
        .eq("id", recordId)
        .eq("property_id", propertyId)
        .eq("conversation_id", conversationId)
        .select("id,conversation_id,stage,outcome,quoted_rate_cents,stage_set_at")
        .single()
      if (error) throw new Error(error.message)

      try {
        await syncPipelineSalesAttribution(db, propertyId, data, {
          actorId: operatore.titolare.adminUserId,
          at: actionAt,
          stageWasTouched: true,
          quoteValueWasTouched: false,
        })
      } catch (syncError) {
        console.error("[inbox-crm-state] sales attribution sync failed", syncError)
      }

      await registraCambioStatoCrm({
        propertyId,
        conversationId,
        actor: operatore.titolare,
        source,
        from: before.stage,
        to: data.stage,
        recordId,
      })
      return NextResponse.json({ source, record: { id: data.id, stage: faseDi(data), stageSetAt: data.stage_set_at } })
    }

    if (source === "apollo_prospect") {
      if (!APOLLO_STAGE_KEYS.has(stage)) {
        return NextResponse.json({ error: "Stato prospect non valido" }, { status: 400 })
      }
      const { data: before, error: beforeError } = await db
        .from("crm_apollo_prospects")
        .select("id,sales_stage,contact_id,email")
        .eq("id", recordId)
        .eq("property_id", propertyId)
        .maybeSingle()
      if (beforeError) throw new Error(beforeError.message)
      if (!before) return NextResponse.json({ error: "Prospect non trovato" }, { status: 404 })

      const sameContact = Boolean(conversation.contact_id && before.contact_id === conversation.contact_id)
      const sameEmail = Boolean(
        conversation.contact_email && before.email &&
          String(conversation.contact_email).trim().toLowerCase() === String(before.email).trim().toLowerCase(),
      )
      if (!sameContact && !sameEmail) {
        return NextResponse.json({ error: "Il prospect non appartiene a questa conversazione" }, { status: 409 })
      }

      const { data, error } = await db
        .from("crm_apollo_prospects")
        .update({ sales_stage: stage, updated_at: actionAt })
        .eq("id", recordId)
        .eq("property_id", propertyId)
        .select("id,sales_stage")
        .single()
      if (error) throw new Error(error.message)

      await registraCambioStatoCrm({
        propertyId,
        conversationId,
        actor: operatore.titolare,
        source,
        from: before.sales_stage,
        to: data.sales_stage,
        recordId,
      })
      return NextResponse.json({ source, record: { id: data.id, stage: data.sales_stage } })
    }

    return NextResponse.json({ error: "Sorgente CRM non supportata" }, { status: 400 })
  } catch (error) {
    return handleServiceError(error)
  }
}
