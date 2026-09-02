import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { sendFourBidQuote } from "@/lib/4bid/quotes"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa.from("profiles").select("role").eq("id", user.id).single()
  const svc = await createServiceRoleClient()
  const { data: agent } = await svc.from("sales_agents")
    .select("id,is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle()
  const { data: deal } = await svc.from("deals").select("id,agent_id,stage,probability").eq("id", id).maybeSingle()
  if (!deal) return NextResponse.json({ error: "deal_not_found" }, { status: 404 })
  if (profile?.role !== "super_admin" && (!agent || deal.agent_id !== agent.id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as { quote_id?: string; cc?: string[]; bcc?: string[] }
  const quoteId = String(body.quote_id || "").trim()
  if (!quoteId) return NextResponse.json({ error: "quote_id obbligatorio" }, { status: 400 })

  const { data: link } = await svc.from("deal_quotes")
    .select("id,external_quote_id")
    .eq("deal_id", id)
    .eq("external_quote_id", quoteId)
    .maybeSingle()
  if (!link) return NextResponse.json({ error: "quote_not_linked_to_deal" }, { status: 404 })

  try {
    const sent = await sendFourBidQuote(quoteId, { cc: body.cc, bcc: body.bcc })
    await svc.from("deal_quotes").update({
      quote_number: sent.quote_number,
      public_url: sent.public_url,
      status: sent.status,
      sent_at: sent.sent_at || new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", link.id)

    if (!["won", "lost"].includes(deal.stage || "")) {
      await svc.from("deals").update({
        stage: "proposal",
        probability: Math.max(Number(deal.probability) || 0, 60),
        stage_changed_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      }).eq("id", id)
    }

    return NextResponse.json(sent)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invio preventivo non riuscito" }, { status: 502 })
  }
}
