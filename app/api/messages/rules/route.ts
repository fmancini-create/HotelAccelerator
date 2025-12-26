import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET - Ottiene regole attive per property_id e sessione
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get("property_id")
    const sessionId = searchParams.get("session_id")
    const currentPage = searchParams.get("page") || "/"

    if (!propertyId) {
      return NextResponse.json({ error: "property_id is required. No default tenant allowed." }, { status: 400 })
    }

    if (!sessionId) {
      return NextResponse.json({ error: "session_id required" }, { status: 400 })
    }

    const supabase = await createClient()
    const now = new Date().toISOString()

    // Ottiene regole attive per questa property
    const { data: rules, error: rulesError } = await supabase
      .from("message_rules")
      .select("*")
      .eq("property_id", propertyId)
      .eq("is_active", true)
      .or(`start_date.is.null,start_date.lte.${now}`)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .order("priority", { ascending: false })

    if (rulesError) {
      console.error("Error fetching rules:", rulesError)
      return NextResponse.json({ error: "Failed to fetch rules" }, { status: 500 })
    }

    // Ottiene impressioni per questa sessione (ultime 24h)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: impressions } = await supabase
      .from("message_impressions")
      .select("rule_id, impression_type, created_at")
      .eq("session_id", sessionId)
      .eq("property_id", propertyId)
      .gte("created_at", yesterday)

    // Filtra regole in base a impressioni e targeting pagina
    const eligibleRules = (rules || []).filter((rule) => {
      // Verifica targeting pagina
      const targetPages = rule.target_pages || []
      const excludePages = rule.exclude_pages || []

      // Se ci sono target_pages, la pagina deve matchare
      if (targetPages.length > 0) {
        const matches = targetPages.some((pattern: string) => {
          const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$")
          return regex.test(currentPage)
        })
        if (!matches) return false
      }

      // Se la pagina è in exclude_pages, skip
      if (excludePages.length > 0) {
        const excluded = excludePages.some((pattern: string) => {
          const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$")
          return regex.test(currentPage)
        })
        if (excluded) return false
      }

      // Verifica limite impressioni per sessione
      const ruleImpressions = (impressions || []).filter((i) => i.rule_id === rule.id && i.impression_type === "view")
      if (ruleImpressions.length >= rule.max_impressions_per_session) {
        return false
      }

      // Verifica limite impressioni giornaliere
      const today = new Date().toISOString().split("T")[0]
      const todayImpressions = ruleImpressions.filter((i) => i.created_at.startsWith(today))
      if (todayImpressions.length >= rule.max_impressions_per_day) {
        return false
      }

      return true
    })

    return NextResponse.json({
      rules: eligibleRules,
      session_impressions: impressions || [],
    })
  } catch (error) {
    console.error("Error in messages/rules:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
