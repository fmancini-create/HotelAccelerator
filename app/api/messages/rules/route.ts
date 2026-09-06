import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

type MessageRule = {
  id: string
  target_pages?: string[] | null
  exclude_pages?: string[] | null
  max_impressions_per_session: number
  max_impressions_per_day: number
}

type Impression = {
  rule_id: string
  impression_type: string
  created_at: string
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "private, no-store",
}

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS })
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// GET - Ottiene regole attive per property_id e sessione
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get("property_id")
    const sessionId = searchParams.get("session_id")
    const currentPage = searchParams.get("page") || "/"

    if (!propertyId) {
      return response({ error: "property_id is required. No default tenant allowed." }, 400)
    }

    if (!sessionId) {
      return response({ error: "session_id required" }, 400)
    }

    // Endpoint PUBBLICO (widget sul sito del cliente, nessuna sessione):
    // `message_rules` e `message_impressions` sono chiuse al ruolo `anon`,
    // quindi serve il service client. Entrambe le query qui sotto filtrano per
    // `property_id`: è quello, non RLS, a garantire l'isolamento fra clienti.
    const supabase = createServiceClient()
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
      return response({ error: "Failed to fetch rules" }, 500)
    }

    // Ottiene impressioni per questa sessione (ultime 24h)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: impressions } = await supabase
      .from("message_impressions")
      .select("rule_id, impression_type, created_at")
      .eq("session_id", sessionId)
      .eq("property_id", propertyId)
      .gte("created_at", yesterday)

    const eligibleRules = (rules || []).filter((rule: MessageRule) => {
      const targetPages = rule.target_pages || []
      const excludePages = rule.exclude_pages || []

      if (targetPages.length > 0) {
        const matches = targetPages.some((pattern: string) => {
          const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$")
          return regex.test(currentPage)
        })
        if (!matches) return false
      }

      if (excludePages.length > 0) {
        const excluded = excludePages.some((pattern: string) => {
          const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$")
          return regex.test(currentPage)
        })
        if (excluded) return false
      }

      const ruleImpressions = (impressions || []).filter(
        (i: Impression) => i.rule_id === rule.id && i.impression_type === "view",
      )
      if (ruleImpressions.length >= rule.max_impressions_per_session) return false

      const today = new Date().toISOString().split("T")[0]
      const todayImpressions = ruleImpressions.filter((i: Impression) => i.created_at.startsWith(today))
      if (todayImpressions.length >= rule.max_impressions_per_day) return false

      return true
    })

    return response({
      rules: eligibleRules,
      session_impressions: impressions || [],
    })
  } catch (error) {
    console.error("Error in messages/rules:", error)
    return response({ error: "Internal error" }, 500)
  }
}
