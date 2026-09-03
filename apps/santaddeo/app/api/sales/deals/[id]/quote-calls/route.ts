import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import {
  listFourBidQuoteCallsForDeal,
  listFourBidQuoteCallsForQuote,
  type FourBidQuoteCall,
} from "@/lib/4bid/quotes"

export const dynamic = "force-dynamic"

async function accessDeal(dealId: string) {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return { ok: false as const, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) }

  const { data: profile } = await authSupa.from("profiles").select("role").eq("id", user.id).single()
  const svc = await createServiceRoleClient()
  const { data: agent } = await svc.from("sales_agents")
    .select("id,is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle()
  const { data: deal, error } = await svc.from("deals").select("id,agent_id").eq("id", dealId).single()
  if (error || !deal) return { ok: false as const, response: NextResponse.json({ error: "deal_not_found" }, { status: 404 }) }

  const isSuperAdmin = profile?.role === "super_admin"
  if (!isSuperAdmin && (!agent || deal.agent_id !== agent.id)) {
    return { ok: false as const, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }

  return { ok: true as const, svc }
}

function dedupeCalls(calls: FourBidQuoteCall[]) {
  const byId = new Map<string, FourBidQuoteCall>()
  for (const call of calls) byId.set(call.id, call)
  return Array.from(byId.values()).sort((a, b) => {
    const left = a.started_at ? new Date(a.started_at).getTime() : 0
    const right = b.started_at ? new Date(b.started_at).getTime() : 0
    return right - left
  })
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await accessDeal(id)
  if (!access.ok) return access.response

  try {
    const remoteCalls = await listFourBidQuoteCallsForDeal(id)

    // Also inspect locally-linked external quotes. This covers older deals that were
    // linked before source_parent_id was consistently propagated to 4BID.
    const { data: links } = await access.svc.from("deal_quotes")
      .select("external_quote_id")
      .eq("deal_id", id)
      .not("external_quote_id", "is", null)

    const linkedCalls: FourBidQuoteCall[] = []
    for (const link of links || []) {
      const quoteId = String(link.external_quote_id || "").trim()
      if (!quoteId) continue
      try {
        linkedCalls.push(...await listFourBidQuoteCallsForQuote(quoteId))
      } catch (error) {
        console.warn("[deal-quote-calls] linked quote lookup skipped", quoteId, error instanceof Error ? error.message : "unknown")
      }
    }

    return NextResponse.json({
      calls: dedupeCalls([...remoteCalls, ...linkedCalls]),
      source: "4bid",
      integration_configured: true,
    })
  } catch (error) {
    return NextResponse.json({
      calls: [],
      source: "4bid",
      integration_configured: false,
      integration_error: error instanceof Error ? error.message : "4BID non raggiungibile",
    })
  }
}
