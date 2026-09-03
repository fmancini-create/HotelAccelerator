import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { createFourBidQuote, listFourBidQuotesForDeal, updateFourBidQuote, type FourBidQuote } from "@/lib/4bid/quotes"

export const dynamic = "force-dynamic"

type AccessContext = {
  user: { id: string; email?: string | null }
  profile: Record<string, any>
  svc: Awaited<ReturnType<typeof createServiceRoleClient>>
  deal: Record<string, any>
}

async function accessDeal(dealId: string): Promise<{ ok: true; ctx: AccessContext } | { ok: false; response: NextResponse }> {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) }

  const { data: profile } = await authSupa.from("profiles")
    .select("id,email,first_name,last_name,role,job_title")
    .eq("id", user.id)
    .single()
  const svc = await createServiceRoleClient()
  const { data: agent } = await svc.from("sales_agents")
    .select("id,is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle()
  const { data: deal, error } = await svc.from("deals").select("*").eq("id", dealId).single()
  if (error || !deal) return { ok: false, response: NextResponse.json({ error: "deal_not_found" }, { status: 404 }) }

  const isSuperAdmin = profile?.role === "super_admin"
  if (!isSuperAdmin && (!agent || deal.agent_id !== agent.id)) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }

  return { ok: true, ctx: { user, profile: profile || {}, svc, deal } }
}

function actorName(profile: Record<string, any>, fallback: string | null | undefined) {
  const full = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim()
  return full || fallback || ""
}

function localRow(quote: FourBidQuote, dealId: string, createdBy?: string) {
  return {
    deal_id: dealId,
    external_quote_id: quote.id,
    source_record_id: quote.source_record_id,
    quote_number: quote.quote_number,
    public_url: quote.public_url,
    status: quote.status,
    total_amount: quote.total_amount,
    currency: quote.currency || "eur",
    sent_at: quote.sent_at,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...(createdBy ? { created_by: createdBy } : {}),
  }
}

async function syncLocal(ctx: AccessContext, quote: FourBidQuote) {
  const row = localRow(quote, ctx.deal.id, ctx.user.id)
  const { error } = await ctx.svc.from("deal_quotes")
    .upsert(row, { onConflict: "external_quote_id" })
  if (error) console.error("[deal-quotes] local sync error:", error.message)
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await accessDeal(id)
  if (!access.ok) return access.response
  const { ctx } = access

  try {
    const remote = await listFourBidQuotesForDeal(id)
    for (const quote of remote) await syncLocal(ctx, quote)
    return NextResponse.json({ quotes: remote, source: "4bid", integration_configured: true })
  } catch (error) {
    const { data: local } = await ctx.svc.from("deal_quotes")
      .select("*")
      .eq("deal_id", id)
      .order("created_at", { ascending: false })
    return NextResponse.json({
      quotes: local || [],
      source: "local_cache",
      integration_configured: false,
      integration_error: error instanceof Error ? error.message : "4BID non raggiungibile",
    })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await accessDeal(id)
  if (!access.ok) return access.response
  const { ctx } = access

  const body = await request.json().catch(() => ({})) as Record<string, any>
  const sourceRecordId = typeof body.source_record_id === "string" && body.source_record_id.trim()
    ? body.source_record_id.trim()
    : randomUUID()

  try {
    const quote = await createFourBidQuote({
      ...body,
      source_record_id: sourceRecordId,
      source_parent_id: id,
      client_name: body.client_name ?? ctx.deal.prospect_name ?? "",
      client_company: body.client_company ?? ctx.deal.prospect_hotel_name ?? null,
      client_email: body.client_email ?? ctx.deal.prospect_email ?? null,
      actor_user_id: ctx.user.id,
      actor_name: actorName(ctx.profile, ctx.user.email),
      actor_email: ctx.profile.email || ctx.user.email || null,
      actor_role: ctx.profile.job_title || ctx.profile.role || null,
    })
    await syncLocal(ctx, quote)

    if (!["won", "lost"].includes(ctx.deal.stage || "")) {
      await ctx.svc.from("deals").update({
        stage: "proposal",
        probability: Math.max(Number(ctx.deal.probability) || 0, 60),
        stage_changed_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      }).eq("id", id)
    }

    return NextResponse.json({ quote }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore creazione preventivo 4BID" }, { status: 502 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await accessDeal(id)
  if (!access.ok) return access.response
  const { ctx } = access
  const body = await request.json().catch(() => ({})) as Record<string, any>
  const quoteId = String(body.quote_id || "").trim()
  if (!quoteId) return NextResponse.json({ error: "quote_id obbligatorio" }, { status: 400 })

  const { data: link } = await ctx.svc.from("deal_quotes")
    .select("external_quote_id")
    .eq("deal_id", id)
    .eq("external_quote_id", quoteId)
    .maybeSingle()
  if (!link) return NextResponse.json({ error: "quote_not_linked_to_deal" }, { status: 404 })

  try {
    const quote = await updateFourBidQuote(quoteId, body)
    await syncLocal(ctx, quote)
    return NextResponse.json({ quote })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore aggiornamento preventivo 4BID" }, { status: 502 })
  }
}
