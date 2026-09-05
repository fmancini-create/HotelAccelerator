import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireAreaApi } from "@/lib/auth/area-access"
import { areaDeniedResponse, isAreaDenied } from "@/lib/auth/area-denied"
import { adminUserIdPerDatabase, getCallerIdentity } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const Body = z.object({
  clientSessionId: z.string().uuid(),
  source: z.enum(["remote_browser", "direct_iframe"]).optional(),
  activeSeconds: z.number().int().min(0).max(45).optional(),
  closeReason: z.string().max(80).optional(),
})

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
}

async function identify(request: NextRequest) {
  const decision = await requireAreaApi("crm", request)
  if (isAreaDenied(decision)) return { denied: areaDeniedResponse(decision) as NextResponse }
  const identity = await getCallerIdentity(request)
  if (!identity?.propertyId) return { denied: json({ error: "Non autenticato" }, 401) }
  return { identity, propertyId: identity.propertyId }
}

async function parse(request: NextRequest) {
  try {
    return Body.parse(await request.json())
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const who = await identify(request)
  if ("denied" in who) return who.denied
  const body = await parse(request)
  if (!body?.source) return json({ error: "Sessione PMS non valida" }, 400)

  const sb = createServiceClient()
  const { data, error } = await sb
    .from("pms_usage_sessions")
    .upsert(
      {
        property_id: who.propertyId,
        client_session_id: body.clientSessionId,
        operator_id: adminUserIdPerDatabase(who.identity.adminUserId),
        operator_label: who.identity.fullName ?? who.identity.email,
        source: body.source,
        observable: body.source === "remote_browser",
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "property_id,client_session_id", ignoreDuplicates: true },
    )
    .select("id, source, observable, started_at, active_seconds")
    .maybeSingle()

  if (error) {
    console.error("[pms-usage] start failed", { propertyId: who.propertyId, detail: error.message })
    return json({ error: "Misurazione uso PMS non disponibile" }, 500)
  }
  return json({ ok: true, session: data })
}

export async function PATCH(request: NextRequest) {
  const who = await identify(request)
  if ("denied" in who) return who.denied
  const body = await parse(request)
  if (!body) return json({ error: "Heartbeat PMS non valido" }, 400)

  const sb = createServiceClient()
  const { data, error } = await sb.rpc("heartbeat_pms_usage_session", {
    p_property_id: who.propertyId,
    p_client_session_id: body.clientSessionId,
    p_active_seconds: body.activeSeconds ?? 0,
  })
  if (error) {
    console.error("[pms-usage] heartbeat failed", { propertyId: who.propertyId, detail: error.message })
    return json({ error: "Heartbeat PMS non salvato" }, 500)
  }
  return json({ ok: true, session: Array.isArray(data) ? data[0] ?? null : data })
}

export async function DELETE(request: NextRequest) {
  const who = await identify(request)
  if ("denied" in who) return who.denied
  const body = await parse(request)
  if (!body) return json({ error: "Chiusura sessione PMS non valida" }, 400)

  const now = new Date().toISOString()
  const sb = createServiceClient()
  const { error } = await sb
    .from("pms_usage_sessions")
    .update({ ended_at: now, close_reason: body.closeReason ?? "page_leave", last_heartbeat_at: now, updated_at: now })
    .eq("property_id", who.propertyId)
    .eq("client_session_id", body.clientSessionId)
    .is("ended_at", null)

  if (error) return json({ error: "Chiusura sessione PMS non salvata" }, 500)
  return json({ ok: true })
}
