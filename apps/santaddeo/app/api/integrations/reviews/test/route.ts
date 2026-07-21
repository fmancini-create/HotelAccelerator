import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { ApifyReviewService } from "@/lib/services/apify-review-service"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    // Prefer per-tenant token if user typed one; otherwise fall back to shared env-var token
    const effectiveToken = (body?.apiToken as string | undefined)?.trim() || process.env.APIFY_API_TOKEN?.trim()

    if (!effectiveToken) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Nessun token Apify disponibile. L'amministratore deve impostare APIFY_API_TOKEN oppure inserisci un token personale.",
        },
        { status: 400 }
      )
    }

    const service = new ApifyReviewService(effectiveToken)
    const result = await service.testConnection()

    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] Error testing Apify connection:", error)
    return NextResponse.json({ success: false, message: "Failed to test connection" }, { status: 500 })
  }
}
