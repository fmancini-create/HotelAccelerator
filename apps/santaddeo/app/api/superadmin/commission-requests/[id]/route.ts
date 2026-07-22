import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check superadmin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_superadmin")
      .eq("id", user.id)
      .single()

    if (profile?.role !== "system_admin" && !profile?.is_superadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { action, notes } = body

    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    // Get the request
    const { data: commRequest, error: fetchError } = await supabase
      .from("commission_plan_requests")
      .select(`
        *,
        hotel:hotels(id, name, total_rooms, star_rating),
        profile:profiles!commission_plan_requests_user_id_fkey(email, first_name, full_name, organization_id)
      `)
      .eq("id", id)
      .single()

    if (fetchError || !commRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 })
    }

    if (commRequest.status !== "pending") {
      return NextResponse.json({ error: "Request already processed" }, { status: 400 })
    }

    // Update request status
    const { error: updateError } = await supabase
      .from("commission_plan_requests")
      .update({
        status: action === "approve" ? "approved" : "rejected",
        status_changed_at: new Date().toISOString(),
        status_changed_by: user.id,
        status_notes: notes || null,
      })
      .eq("id", id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // If approved, create the actual subscription
    if (action === "approve") {
      const { error: subError } = await supabase
        .from("accelerator_subscriptions")
        .insert({
          hotel_id: commRequest.hotel_id,
          plan_type: "commission",
          algorithm_type: commRequest.algorithm_type,
          auto_pilot: commRequest.auto_pilot,
          is_active: true,
          started_at: new Date().toISOString(),
          payment_status: "active",
          contract_accepted: commRequest.contract_accepted,
          contract_accepted_at: commRequest.contract_accepted_at,
          contract_version: commRequest.contract_version,
        })

      if (subError) {
        console.error("[v0] Error creating subscription:", subError)
        // Rollback status
        await supabase
          .from("commission_plan_requests")
          .update({ status: "pending", status_changed_at: null, status_changed_by: null })
          .eq("id", id)
        return NextResponse.json({ error: "Error creating subscription: " + subError.message }, { status: 500 })
      }

      // Apply default pricing rules
      try {
        const hotel_id = commRequest.hotel_id

        const [existingBands, existingLm] = await Promise.all([
          supabase.from("occupancy_band_groups").select("id").eq("hotel_id", hotel_id).limit(1),
          supabase.from("last_minute_levels").select("id").eq("hotel_id", hotel_id).limit(1),
        ])

        const hasBands = (existingBands.data?.length || 0) > 0
        const hasLm = (existingLm.data?.length || 0) > 0

        if (!hasBands || !hasLm) {
          const [groupsRes, bandsRes, lmRes] = await Promise.all([
            supabase.from("default_band_group_templates").select("*").order("sort_order"),
            supabase.from("default_band_templates").select("*").order("group_id").order("band_index"),
            supabase.from("default_lm_level_templates").select("*").order("sort_order"),
          ])

          if (!hasBands && groupsRes.data && groupsRes.data.length > 0) {
            const newGroups = groupsRes.data.map((g) => ({
              hotel_id,
              name: g.name,
              sort_order: g.sort_order,
            }))
            const { data: insertedGroups } = await supabase
              .from("occupancy_band_groups")
              .insert(newGroups)
              .select("id, name, sort_order")

            if (insertedGroups) {
              const bandInserts: Array<Record<string, unknown>> = []
              for (const ig of insertedGroups) {
                const defaultGroup = groupsRes.data.find((dg) => dg.sort_order === ig.sort_order)
                if (!defaultGroup) continue
                const defaultBands = (bandsRes.data || []).filter((b) => b.group_id === defaultGroup.id)
                for (const db of defaultBands) {
                  bandInserts.push({
                    hotel_id,
                    group_id: ig.id,
                    band_index: db.band_index,
                    min_pct: db.min_pct,
                    max_pct: db.max_pct,
                    increment_pct: db.increment_pct,
                    label: db.label,
                    occupancy_mode: "pct",
                    increment_mode: "pct",
                  })
                }
              }
              if (bandInserts.length > 0) {
                await supabase.from("occupancy_bands").insert(bandInserts)
              }
            }
          }

          if (!hasLm && lmRes.data && lmRes.data.length > 0) {
            const lmInserts = lmRes.data.map((l) => ({
              hotel_id,
              name: l.name,
              sort_order: l.sort_order,
              color: l.color,
              discount_pct: l.discount_pct,
              min_occupancy_pct: l.min_occupancy_pct,
              max_occupancy_pct: l.max_occupancy_pct,
              occupancy_mode: "pct",
              min_occupancy_num: 0,
              max_occupancy_num: 0,
            }))
            await supabase.from("last_minute_levels").insert(lmInserts)
          }
        }
      } catch (defaultsErr) {
        console.error("[v0] Error applying pricing defaults:", defaultsErr)
      }
    }

    // Send email notification to user
    const userEmail = commRequest.profile?.email
    const userName = commRequest.profile?.first_name || commRequest.profile?.full_name?.split(" ")[0] || ""
    const hotelName = commRequest.hotel?.name || "Hotel"

    if (userEmail) {
      try {
        if (action === "approve") {
          await sendEmail({
            to: userEmail,
            subject: `[SANTADDEO] Piano Commissione Approvato - ${hotelName}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #16a34a;">Piano Commissione Approvato!</h2>
                <p>Ciao${userName ? ` ${userName}` : ""},</p>
                <p>Ottima notizia! La tua richiesta di attivazione del <strong>Piano Commissione</strong> per <strong>${hotelName}</strong> e stata approvata.</p>
                ${notes ? `<p><strong>Note:</strong> ${notes}</p>` : ""}
                <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
                  <p>Il servizio Hotel Accelerator e ora attivo. Puoi accedere alla dashboard per iniziare a utilizzare tutte le funzionalita.</p>
                </div>
                <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://app.santaddeo.com"}/accelerator/dashboard" 
                   style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
                  Vai alla Dashboard
                </a>
                <p style="color: #666; margin-top: 24px;">Il Team SANTADDEO</p>
              </div>
            `,
          })
        } else {
          await sendEmail({
            to: userEmail,
            subject: `[SANTADDEO] Richiesta Piano Commissione - ${hotelName}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1a1a1a;">Aggiornamento sulla tua richiesta</h2>
                <p>Ciao${userName ? ` ${userName}` : ""},</p>
                <p>Purtroppo la tua richiesta di attivazione del Piano Commissione per <strong>${hotelName}</strong> non e stata approvata in questo momento.</p>
                ${notes ? `<div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;"><p><strong>Motivo:</strong> ${notes}</p></div>` : ""}
                <p>Puoi comunque attivare il <strong>Piano Fee Mensile</strong> per iniziare subito a utilizzare Hotel Accelerator, oppure contattarci per maggiori informazioni.</p>
                <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://app.santaddeo.com"}/upgrade/hotel-accelerator" 
                   style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
                  Scopri i Piani
                </a>
                <p style="color: #666; margin-top: 24px;">Il Team SANTADDEO</p>
              </div>
            `,
          })
        }
      } catch (emailErr) {
        console.error("[v0] Error sending status email:", emailErr)
      }
    }

    return NextResponse.json({ 
      success: true, 
      status: action === "approve" ? "approved" : "rejected",
    })
  } catch (error) {
    console.error("[v0] Error in commission-requests PATCH:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
