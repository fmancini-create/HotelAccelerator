import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { createClient } from "@/lib/supabase/server"
import { format } from "date-fns"

export async function GET() {
  try {
    // Verify super_admin
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (profile?.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Fetch all logs (last 90 days)
    const serviceClient = await createServiceRoleClient()
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const { data: logs, error } = await serviceClient
      .from("audit_logs")
      .select("*")
      .gte("created_at", ninetyDaysAgo.toISOString())
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Generate CSV
    const headers = [
      "ID",
      "Data/Ora",
      "Email Utente",
      "Ruolo",
      "Azione",
      "Tipo Risorsa",
      "ID Risorsa",
      "ID Organizzazione",
      "ID Hotel",
    ]

    const rows = (logs || []).map((log) => [
      log.id,
      format(new Date(log.created_at), "yyyy-MM-dd HH:mm:ss"),
      log.user_email || "",
      log.user_role || "",
      log.action,
      log.resource_type,
      log.resource_id || "",
      log.organization_id || "",
      log.hotel_id || "",
    ])

    const csv = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n")

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="audit-logs-${format(new Date(), "yyyy-MM-dd")}.csv"`,
      },
    })
  } catch (error) {
    console.error("Error exporting audit logs:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
