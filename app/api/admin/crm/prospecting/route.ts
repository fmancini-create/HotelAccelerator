import { NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { z } from "zod"
import { getCurrentProperty } from "@/lib/auth-property"
import { areaDeniedResponse, isAreaDenied } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"
import { createServiceClient } from "@/lib/supabase/server"
import {
  actionChannel,
  addDays,
  computeProspectScore,
  defaultEmailDraft,
  defaultLinkedInDraft,
  firstProspectAction,
  type ProspectAction,
} from "@/lib/crm/prospecting"
import { deliverProspectingEmail } from "@/lib/crm/prospecting-email"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const outcomeSchema = z.enum(["sent", "connected", "replied", "no_response", "not_interested", "completed", "skipped"])
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), prospectId: z.string().uuid() }),
  z.object({ action: z.literal("generate"), activityId: z.string().uuid() }),
  z.object({ action: z.literal("save_draft"), activityId: z.string().uuid(), subject: z.string().trim().max(240).nullable().optional(), body: z.string().trim().max(8000) }),
  z.object({ action: z.literal("complete"), activityId: z.string().uuid(), outcome: outcomeSchema }),
  z.object({ action: z.literal("set_legal_basis"), prospectId: z.string().uuid(), legalBasis: z.enum(["legitimate_interest_b2b", "consent", "contract"]) }),
  z.object({ action: z.literal("set_automation"), prospectId: z.string().uuid(), enabled: z.boolean(), channelId: z.string().uuid().nullable().optional() }),
  z.object({ action: z.literal("approve_email"), activityId: z.string().uuid(), channelId: z.string().uuid() }),
  z.object({ action: z.literal("send_email_now"), activityId: z.string().uuid(), channelId: z.string().uuid() }),
  z.object({ action: z.literal("pause"), prospectId: z.string().uuid(), paused: z.boolean() }),
])

const iso = () => new Date().toISOString()

async function prospect(db: any, propertyId: string, id: string) {
  const { data, error } = await db.from("crm_apollo_prospects").select("*").eq("id", id).eq("property_id", propertyId).single()
  if (error || !data) throw new Error("Prospect non trovato nel tenant attivo")
  return data
}

async function activity(db: any, propertyId: string, id: string) {
  const { data, error } = await db.from("crm_sales_activities").select("*").eq("id", id).eq("property_id", propertyId).single()
  if (error || !data) throw new Error("Attività commerciale non trovata")
  return data
}

async function queue(db: any, p: any, action: ProspectAction, dueAt = new Date()) {
  const { data: existing, error: findError } = await db
    .from("crm_sales_activities")
    .select("id")
    .eq("property_id", p.property_id)
    .eq("prospect_id", p.id)
    .eq("action", action)
    .in("status", ["pending", "ready", "processing"])
    .limit(1)
    .maybeSingle()
  if (findError) throw findError
  if (existing?.id) return existing.id

  const channel = actionChannel(action)
  let subject: string | null = null
  let body: string | null = null
  if (action === "linkedin_invite" || action === "linkedin_message") body = defaultLinkedInDraft(action, p.full_name || "", p.organization_name)
  if (action === "email_intro" || action === "email_followup") {
    const draft = defaultEmailDraft(p.full_name || "", p.organization_name, action === "email_followup")
    subject = draft.subject
    body = draft.body
  }

  const autoEmail = channel === "email" && p.automation_enabled && p.legal_basis && p.preferred_email_channel_id && !p.do_not_contact && !p.outreach_paused
  const { data, error } = await db.from("crm_sales_activities").insert({
    property_id: p.property_id,
    prospect_id: p.id,
    contact_id: p.contact_id,
    channel,
    action,
    status: autoEmail ? "ready" : "pending",
    due_at: dueAt.toISOString(),
    approved_at: autoEmail ? iso() : null,
    requires_human: !autoEmail,
    subject,
    body,
    metadata: autoEmail ? { sender_channel_id: p.preferred_email_channel_id, auto_approved_by_sequence: true } : {},
  }).select("id").single()
  if (error) throw error

  await db.from("crm_apollo_prospects").update({ next_action: action, next_action_at: dueAt.toISOString(), updated_at: iso() }).eq("id", p.id).eq("property_id", p.property_id)
  return data.id
}

async function aiDraft(a: any, p: any) {
  const fallback = a.channel === "linkedin"
    ? { subject: null, body: defaultLinkedInDraft(a.action, p.full_name || "", p.organization_name) }
    : defaultEmailDraft(p.full_name || "", p.organization_name, a.action === "email_followup")
  if (!process.env.OPENAI_API_KEY && !process.env.AI_GATEWAY_API_KEY) return fallback

  try {
    const linkedin = a.channel === "linkedin"
    const prompt = [
      "Sei un sales assistant B2B italiano specializzato nel settore alberghiero.",
      "4BID propone HotelAccelerator: CRM, omnichannel, automazione commerciale e AI per hotel.",
      `Prospect: ${p.full_name || "n/d"}; ruolo: ${p.job_title || "n/d"}; hotel: ${p.organization_name || "n/d"}; città: ${p.city || "n/d"}.`,
      "Scrivi in italiano naturale, personale, non aggressivo e non inventare informazioni.",
      linkedin
        ? a.action === "linkedin_invite"
          ? "Richiesta LinkedIn: massimo 250 caratteri, non vendere, restituisci solo il testo."
          : "Messaggio LinkedIn: massimo 500 caratteri, apri una conversazione, restituisci solo il testo."
        : "Email breve. Prima riga OGGETTO: <oggetto>, riga vuota, poi corpo. Firma Filippo. Nessun elenco.",
    ].join("\n")
    const { text } = await generateText({ model: "openai/gpt-4o-mini", prompt, temperature: 0.4 })
    const value = text.trim()
    if (!value) return fallback
    if (linkedin) return { subject: null, body: value }
    const lines = value.split(/\r?\n/)
    const subjectLine = lines.find((line) => /^oggetto\s*:/i.test(line))
    return {
      subject: subjectLine ? subjectLine.replace(/^oggetto\s*:/i, "").trim() : fallback.subject,
      body: lines.filter((line) => line !== subjectLine).join("\n").trim() || fallback.body,
    }
  } catch (error) {
    console.error("[crm/prospecting] AI fallback:", error)
    return fallback
  }
}

async function complete(db: any, propertyId: string, a: any, outcome: z.infer<typeof outcomeSchema>) {
  const now = new Date()
  const p = await prospect(db, propertyId, a.prospect_id)
  await db.from("crm_sales_activities").update({ status: outcome === "skipped" ? "skipped" : "completed", completed_at: now.toISOString(), outcome, updated_at: now.toISOString() }).eq("id", a.id).eq("property_id", propertyId)

  if (outcome === "not_interested") {
    await db.from("crm_apollo_prospects").update({ do_not_contact: true, automation_enabled: false, linkedin_status: "not_interested", sales_stage: "lost", next_action: null, next_action_at: null, last_action_at: now.toISOString(), last_outcome: outcome, updated_at: now.toISOString() }).eq("id", p.id).eq("property_id", propertyId)
    await db.from("crm_sales_activities").update({ status: "cancelled", updated_at: now.toISOString() }).eq("property_id", propertyId).eq("prospect_id", p.id).in("status", ["pending", "ready"]).neq("id", a.id)
    return
  }

  const patch: Record<string, unknown> = { last_action_at: now.toISOString(), last_outcome: `${a.action}:${outcome}`, updated_at: now.toISOString() }
  let next: ProspectAction | null = null
  let due = now

  if (a.action === "linkedin_invite" && outcome === "sent") {
    Object.assign(patch, { linkedin_status: "invite_sent", sales_stage: "linkedin_pending" }); next = "linkedin_check"; due = addDays(now, 3)
  } else if (a.action === "linkedin_check" && outcome === "connected") {
    Object.assign(patch, { linkedin_status: "connected", sales_stage: "linkedin_connected" }); next = "linkedin_message"
  } else if (a.action === "linkedin_check" && outcome === "replied") {
    Object.assign(patch, { linkedin_status: "replied", sales_stage: "qualified" }); next = "call"
  } else if (a.action === "linkedin_check" && outcome === "no_response") {
    Object.assign(patch, { sales_stage: p.email ? "email_followup" : "linkedin_pending" }); next = p.email ? "email_intro" : "review"
  } else if (a.action === "linkedin_message" && outcome === "sent") {
    Object.assign(patch, { sales_stage: "engaged" }); next = "linkedin_check"; due = addDays(now, 3)
  } else if ((a.action === "email_intro" || a.action === "email_followup") && outcome === "replied") {
    Object.assign(patch, { sales_stage: "qualified" }); next = "call"
  } else if (a.action === "call" && outcome === "completed") {
    Object.assign(patch, { sales_stage: "qualified" })
  }

  await db.from("crm_apollo_prospects").update({ ...patch, next_action: null, next_action_at: null }).eq("id", p.id).eq("property_id", propertyId)
  if (next) await queue(db, { ...p, ...patch }, next, due)
}

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    const db = createServiceClient()
    const [pResult, aResult, cResult] = await Promise.all([
      db.from("crm_apollo_prospects").select("*").eq("property_id", propertyId).neq("status", "dismissed").order("lead_score", { ascending: false }).order("updated_at", { ascending: false }).limit(300),
      db.from("crm_sales_activities").select("*").eq("property_id", propertyId).in("status", ["pending", "ready", "failed"]).order("due_at", { ascending: true }).limit(250),
      db.from("email_channels").select("id,name,email_address,provider,is_default,is_active").eq("property_id", propertyId).eq("is_active", true).order("email_address"),
    ])
    if (pResult.error) throw pResult.error
    if (aResult.error) throw aResult.error
    if (cResult.error) throw cResult.error

    const prospects = pResult.data ?? []
    const byId = new Map(prospects.map((p: any) => [p.id, p]))
    const activities = (aResult.data ?? []).map((a: any) => ({ ...a, prospect: byId.get(a.prospect_id) ?? null }))
    const now = Date.now()
    return NextResponse.json({
      prospects,
      activities,
      emailChannels: cResult.data ?? [],
      summary: {
        prospects: prospects.length,
        highScore: prospects.filter((p: any) => Number(p.lead_score || 0) >= 75).length,
        dueNow: activities.filter((a: any) => new Date(a.due_at).getTime() <= now).length,
        automationEnabled: prospects.filter((p: any) => p.automation_enabled).length,
        connected: prospects.filter((p: any) => ["connected", "replied"].includes(p.linkedin_status)).length,
        qualified: prospects.filter((p: any) => p.sales_stage === "qualified").length,
      },
      policy: { linkedinAutomaticSending: false, emailAutomaticSending: true, emailRequiresRecordedLegalBasis: true, emailRequiresExplicitAutomationOptIn: true },
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("[crm/prospecting] GET:", error)
    return NextResponse.json({ error: "Impossibile caricare il prospecting CRM." }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    const db = createServiceClient()
    const body = requestSchema.parse(await request.json())

    if (body.action === "start") {
      const p = await prospect(db, propertyId, body.prospectId)
      if (p.do_not_contact) return NextResponse.json({ error: "Prospect marcato come non contattabile." }, { status: 409 })
      const scored = computeProspectScore(p)
      await db.from("crm_apollo_prospects").update({ lead_score: scored.score, sales_stage: "new", outreach_paused: false, updated_at: iso() }).eq("id", p.id).eq("property_id", propertyId)
      const activityId = await queue(db, { ...p, lead_score: scored.score }, firstProspectAction(p))
      return NextResponse.json({ ok: true, score: scored.score, signals: scored.signals, activityId })
    }

    if (body.action === "generate") {
      const a = await activity(db, propertyId, body.activityId)
      const p = await prospect(db, propertyId, a.prospect_id)
      const draft = await aiDraft(a, p)
      const { error } = await db.from("crm_sales_activities").update({ ...draft, updated_at: iso() }).eq("id", a.id).eq("property_id", propertyId)
      if (error) throw error
      return NextResponse.json({ ok: true, draft })
    }

    if (body.action === "save_draft") {
      const a = await activity(db, propertyId, body.activityId)
      const { error } = await db.from("crm_sales_activities").update({ subject: body.subject ?? a.subject ?? null, body: body.body, updated_at: iso() }).eq("id", a.id).eq("property_id", propertyId)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    if (body.action === "complete") {
      await complete(db, propertyId, await activity(db, propertyId, body.activityId), body.outcome)
      return NextResponse.json({ ok: true })
    }

    if (body.action === "set_legal_basis") {
      await prospect(db, propertyId, body.prospectId)
      const { error } = await db.from("crm_apollo_prospects").update({ legal_basis: body.legalBasis, updated_at: iso() }).eq("id", body.prospectId).eq("property_id", propertyId)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    if (body.action === "set_automation") {
      const p = await prospect(db, propertyId, body.prospectId)
      if (body.enabled) {
        if (!p.email) return NextResponse.json({ error: "Serve prima un'email del prospect." }, { status: 409 })
        if (!p.legal_basis) return NextResponse.json({ error: "Registra prima la base giuridica del contatto." }, { status: 409 })
        if (!body.channelId) return NextResponse.json({ error: "Seleziona il mittente email." }, { status: 400 })
        const { data: channel } = await db.from("email_channels").select("id").eq("id", body.channelId).eq("property_id", propertyId).eq("is_active", true).maybeSingle()
        if (!channel) return NextResponse.json({ error: "Canale email non valido." }, { status: 400 })
      }
      const { error } = await db.from("crm_apollo_prospects").update({ automation_enabled: body.enabled, preferred_email_channel_id: body.enabled ? body.channelId : p.preferred_email_channel_id, updated_at: iso() }).eq("id", p.id).eq("property_id", propertyId)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    if (body.action === "approve_email" || body.action === "send_email_now") {
      const a = await activity(db, propertyId, body.activityId)
      const p = await prospect(db, propertyId, a.prospect_id)
      if (a.channel !== "email") return NextResponse.json({ error: "Questa attività non è un'email." }, { status: 400 })
      if (!p.legal_basis) return NextResponse.json({ error: "Registra prima la base giuridica." }, { status: 409 })
      if (!a.subject || !a.body) return NextResponse.json({ error: "Genera o completa prima la bozza email." }, { status: 409 })
      const { data: channel } = await db.from("email_channels").select("id").eq("id", body.channelId).eq("property_id", propertyId).eq("is_active", true).maybeSingle()
      if (!channel) return NextResponse.json({ error: "Canale email non valido." }, { status: 400 })
      const metadata = a.metadata && typeof a.metadata === "object" ? a.metadata : {}
      await db.from("crm_sales_activities").update({ status: "ready", approved_at: iso(), requires_human: false, metadata: { ...metadata, sender_channel_id: body.channelId }, updated_at: iso() }).eq("id", a.id).eq("property_id", propertyId)
      if (body.action === "approve_email") return NextResponse.json({ ok: true })

      try {
        const result = await deliverProspectingEmail(db, a.id)
        return NextResponse.json({ ok: true, sent: result.sent ?? null, alreadySent: !!result.alreadySent, alreadyProcessing: !!result.alreadyProcessing })
      } catch (error) {
        const message = (error instanceof Error ? error.message : "delivery_error").slice(0, 500)
        await db.from("crm_sales_activities").update({ status: "ready", last_error: message, updated_at: iso() }).eq("id", a.id).eq("property_id", propertyId).eq("status", "processing").is("sent_at", null)
        throw error
      }
    }

    if (body.action === "pause") {
      const p = await prospect(db, propertyId, body.prospectId)
      const { error } = await db.from("crm_apollo_prospects").update({ outreach_paused: body.paused, automation_enabled: body.paused ? false : p.automation_enabled, sales_stage: body.paused ? "paused" : p.sales_stage === "paused" ? "new" : p.sales_stage, updated_at: iso() }).eq("id", p.id).eq("property_id", propertyId)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: "Azione non supportata." }, { status: 400 })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Richiesta prospecting non valida.", details: error.flatten() }, { status: 400 })
    console.error("[crm/prospecting] POST:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Operazione prospecting non completata." }, { status: 500 })
  }
}
