import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()

    // Fetch all structures with stats
    const { data: structures, error: structuresError } = await supabase.from("properties").select("*")

    if (structuresError) throw structuresError

    // Fetch conversations count
    const { count: conversationCount } = await supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })

    // Fetch messages count
    const { count: messageCount } = await supabase.from("messages").select("*", { count: "exact", head: true })

    // Fetch admin users count
    const { count: userCount } = await supabase.from("admin_users").select("*", { count: "exact", head: true })

    // Calculate stats
    const totalTenants = structures?.length || 0
    const activeTenants = structures?.filter((s) => s.subscription_status === "active").length || 0
    const trialTenants = structures?.filter((s) => s.subscription_status === "trial").length || 0
    const suspendedTenants = structures?.filter((s) => s.subscription_status === "suspended").length || 0

    // Plan distribution
    const planCounts: Record<string, number> = {}
    structures?.forEach((s) => {
      const plan = s.plan || "unknown"
      planCounts[plan] = (planCounts[plan] || 0) + 1
    })
    const planDistribution = Object.entries(planCounts).map(([plan, count]) => ({
      plan: plan.charAt(0).toUpperCase() + plan.slice(1),
      count,
    }))

    // MRR calculation (based on plan prices)
    const planPrices: Record<string, number> = {
      free: 0,
      starter: 49,
      professional: 149,
      enterprise: 399,
    }
    const mrr =
      structures?.reduce((total, s) => {
        if (s.subscription_status === "active" || s.subscription_status === "trial") {
          return total + (planPrices[s.plan] || 0)
        }
        return total
      }, 0) || 0

    // Recent activity (mock for now, would come from command_logs)
    const { data: recentLogs } = await supabase
      .from("command_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10)

    const recentActivity =
      recentLogs?.map((log) => ({
        id: log.id,
        type: "tenant_created" as const,
        tenant: log.property_id,
        description: log.command_type,
        timestamp: log.created_at,
      })) || []

    // Alerts (check for issues)
    const alerts: { id: string; severity: "warning" | "error" | "info"; message: string; tenant?: string }[] = []

    // Check for expiring trials
    const now = new Date()
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    structures?.forEach((s) => {
      if (s.trial_ends_at) {
        const trialEnd = new Date(s.trial_ends_at)
        if (trialEnd > now && trialEnd < weekFromNow) {
          alerts.push({
            id: `trial-${s.id}`,
            severity: "warning",
            message: `Trial in scadenza tra ${Math.ceil((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))} giorni`,
            tenant: s.name,
          })
        }
      }
    })

    return NextResponse.json({
      totalTenants,
      activeTenants,
      trialTenants,
      suspendedTenants,
      totalUsers: userCount || 0,
      totalConversations: conversationCount || 0,
      totalMessages: messageCount || 0,
      mrr,
      mrrGrowth: 0, // Would need historical data
      newTenantsThisMonth: totalTenants, // Simplified
      churnRate: 0,
      recentActivity,
      planDistribution,
      alerts,
    })
  } catch (error) {
    console.error("Dashboard error:", error)
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 })
  }
}
