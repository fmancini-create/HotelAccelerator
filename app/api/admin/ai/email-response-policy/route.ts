import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { areaDeniedResponse, isAreaDenied } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"
import { getEmailAiResponsePolicy, type EmailAiPolicyAction } from "@/lib/ai/email-response-policy"
import { createServiceClient } from "@/lib/supabase/server"

const ACTIONS: EmailAiPolicyAction[] = ["skip", "draft", "autopilot"]

function normaliseList(input: unknown, maxLength = 255): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of input) {
    if (typeof value !== "string") continue
    const clean = value.trim().toLowerCase()
    if (!clean || clean.length > maxLength || seen.has(clean)) continue
    seen.add(clean)
    out.push(clean)
    if (out.length >= 100) break
  }
  return out
}

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("settings", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()
    const settings = await getEmailAiResponsePolicy(supabase, propertyId)
    return NextResponse.json({ settings })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : "Errore"
    return NextResponse.json({ error: message }, { status: message.includes("autenticat") ? 401 : 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAreaApi("settings", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const body = await request.json().catch(() => ({}))
    const payload: Record<string, unknown> = {
      property_id: propertyId,
      updated_at: new Date().toISOString(),
    }

    for (const key of [
      "automated_action",
      "bulk_action",
      "transactional_action",
      "internal_action",
      "unclassified_action",
    ] as const) {
      if (ACTIONS.includes(body[key])) payload[key] = body[key]
    }

    if (Array.isArray(body.trusted_senders)) payload.trusted_senders = normaliseList(body.trusted_senders)
    if (Array.isArray(body.blocked_senders)) payload.blocked_senders = normaliseList(body.blocked_senders)
    if (Array.isArray(body.blocked_domains)) payload.blocked_domains = normaliseList(body.blocked_domains)
    if (Array.isArray(body.internal_domains)) payload.internal_domains = normaliseList(body.internal_domains)
    if (Array.isArray(body.blocked_subject_keywords)) {
      payload.blocked_subject_keywords = normaliseList(body.blocked_subject_keywords, 120)
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("email_ai_response_policies")
      .upsert(payload, { onConflict: "property_id" })
      .select("*")
      .single()

    if (error) throw error
    return NextResponse.json({ settings: data })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : "Errore"
    return NextResponse.json({ error: message }, { status: message.includes("autenticat") ? 401 : 500 })
  }
}
