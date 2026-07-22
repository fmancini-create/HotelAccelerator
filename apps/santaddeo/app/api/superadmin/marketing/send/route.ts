import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email/send-email"

// POST - send a specific campaign email to its recipients
export async function POST(req: Request) {
  const supabase = await createServiceRoleClient()
  const body = await req.json()
  const { campaign_id, email_id } = body

  if (!campaign_id) return NextResponse.json({ error: "campaign_id required" }, { status: 400 })

  // Get campaign
  const { data: campaign } = await supabase
    .from("marketing_campaigns")
    .select("*")
    .eq("id", campaign_id)
    .single()

  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })

  // Get the specific email or next unsent
  let emailQuery = supabase
    .from("marketing_campaign_emails")
    .select("*")
    .eq("campaign_id", campaign_id)

  if (email_id) {
    emailQuery = emailQuery.eq("id", email_id)
  } else {
    emailQuery = emailQuery.eq("status", "draft").order("send_order", { ascending: true }).limit(1)
  }

  const { data: emails } = await emailQuery
  const campaignEmail = emails?.[0]
  if (!campaignEmail) return NextResponse.json({ error: "No email to send" }, { status: 404 })

  // Get recipients based on target_type and filter
  let recipients: { email: string; name: string }[] = []

  if (campaign.target_type === "contacts") {
    const { data: contacts } = await supabase
      .from("marketing_contacts")
      .select("email, name")
      .eq("is_subscribed", true)

    recipients = (contacts || []).map(c => ({ email: c.email, name: c.name }))
  } else {
    // Hotels - get users from organizations/hotels based on filter
    const filter = campaign.target_filter || {}

    let orgQuery = supabase
      .from("organizations")
      .select("id, name, contact_email")

    if (filter.status) {
      // Filter by subscription status
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("organization_id")
        .eq("status", filter.status)

      const orgIds = (subs || []).map(s => s.organization_id).filter(Boolean)
      if (orgIds.length > 0) {
        orgQuery = orgQuery.in("id", orgIds)
      }
    }

    const { data: orgs } = await orgQuery
    recipients = (orgs || [])
      .filter(o => o.contact_email)
      .map(o => ({ email: o.contact_email!, name: o.name }))
  }

  if (recipients.length === 0) {
    return NextResponse.json({ error: "No recipients found", sent: 0 }, { status: 200 })
  }

  // Send emails sequentially (SMTP throttling)
  let sent = 0
  let failed = 0

  for (const recipient of recipients) {
    // Personalize HTML
    const html = campaignEmail.body_html
      .replace(/\{\{name\}\}/g, recipient.name || "")
      .replace(/\{\{email\}\}/g, recipient.email || "")

    const subject = campaignEmail.subject
      .replace(/\{\{name\}\}/g, recipient.name || "")

    try {
      const result = await sendEmail({
        to: recipient.email,
        subject,
        html,
      })

      // Log the send
      await supabase.from("marketing_send_log").insert({
        campaign_email_id: campaignEmail.id,
        recipient_email: recipient.email,
        recipient_name: recipient.name,
        status: result.success ? "sent" : "failed",
      })

      if (result.success) sent++
      else failed++

      // Small delay between sends to avoid SMTP throttling
      await new Promise(r => setTimeout(r, 200))
    } catch {
      failed++
    }
  }

  // Update email status
  await supabase
    .from("marketing_campaign_emails")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      stats_sent: sent,
    })
    .eq("id", campaignEmail.id)

  // Update campaign
  await supabase
    .from("marketing_campaigns")
    .update({
      sends_completed: (campaign.sends_completed || 0) + 1,
      status: (campaign.sends_completed || 0) + 1 >= campaign.total_sends ? "completed" : "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaign_id)

  return NextResponse.json({ sent, failed, total: recipients.length })
}
