import { createServiceRoleClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET - list campaigns with their emails
export async function GET() {
  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .select("*, marketing_campaign_emails(*)") 
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

// POST - create campaign with emails
export async function POST(req: Request) {
  const supabase = getSupabase()
  const body = await req.json()

  const { data: campaign, error: campErr } = await supabase
    .from("marketing_campaigns")
    .insert({
      name: body.name,
      status: "draft",
      target_type: body.target_type || "hotels",
      target_filter: body.target_filter || {},
      start_date: body.start_date || null,
      frequency_days: body.frequency_days || 7,
      total_sends: body.emails?.length || 1,
    })
    .select()
    .single()

  if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 })

  // Insert campaign emails
  if (body.emails?.length) {
    const emails = body.emails.map((e: any, i: number) => ({
      campaign_id: campaign.id,
      send_order: i + 1,
      subject: e.subject || "",
      body_html: e.body_html || "",
      body_json: e.body_json || null,
      status: "draft",
    }))
    await supabase.from("marketing_campaign_emails").insert(emails)
  }

  return NextResponse.json(campaign)
}

// PUT - update campaign
export async function PUT(req: Request) {
  const supabase = getSupabase()
  const body = await req.json()
  const { id, emails, ...updates } = body

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Update campaign
  const { error } = await supabase
    .from("marketing_campaigns")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update emails if provided
  if (emails?.length) {
    // Delete old, insert new
    await supabase.from("marketing_campaign_emails").delete().eq("campaign_id", id)
    const newEmails = emails.map((e: any, i: number) => ({
      campaign_id: id,
      send_order: i + 1,
      subject: e.subject || "",
      body_html: e.body_html || "",
      body_json: e.body_json || null,
      status: e.status || "draft",
      scheduled_at: e.scheduled_at || null,
    }))
    await supabase.from("marketing_campaign_emails").insert(newEmails)
  }

  return NextResponse.json({ ok: true })
}

// DELETE - delete campaign
export async function DELETE(req: Request) {
  const supabase = getSupabase()
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { error } = await supabase.from("marketing_campaigns").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
