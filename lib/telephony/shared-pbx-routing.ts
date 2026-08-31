import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { phoneMatchKey } from "@/lib/telephony/phone-match"

const HINT_TTL_MS = 30 * 60 * 1000

function isMissingRoutingSchema(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false
  return error.code === "42P01" || error.code === "42703" || /telephony_call_route_hints|shared_pbx_journal_property_id/i.test(error.message || "")
}

/**
 * Registra che una chiamata autenticata dal tenant `targetPropertyId` sta
 * passando dal suo agente vocale, ma il relativo ReportCall arrivera' usando
 * la credenziale CRM del tenant/PBX indicato in `shared_pbx_journal_property_id`.
 *
 * Non contiene testo, numero completo o segreti: solo le ultime nove cifre
 * normalizzate e una finestra temporale breve.
 */
export async function touchSharedPbxRouteHint(input: {
  targetPropertyId: string
  callerNumber?: string | null
}): Promise<boolean> {
  const callerKey = phoneMatchKey(input.callerNumber)
  if (!callerKey) return false

  const supabase = createServiceClient()
  const { data: integration, error: integrationError } = await supabase
    .from("telephony_integrations")
    .select("shared_pbx_journal_property_id")
    .eq("property_id", input.targetPropertyId)
    .eq("provider", "3cx")
    .eq("is_active", true)
    .maybeSingle()

  if (integrationError) {
    if (isMissingRoutingSchema(integrationError)) return false
    console.error("[3cx-shared-pbx] mapping lookup failed", {
      targetPropertyId: input.targetPropertyId,
      code: integrationError.code,
    })
    return false
  }

  const sourcePropertyId = integration?.shared_pbx_journal_property_id
    ? String(integration.shared_pbx_journal_property_id)
    : ""
  if (!sourcePropertyId || sourcePropertyId === input.targetPropertyId) return false

  const now = new Date()
  const { error } = await supabase.from("telephony_call_route_hints").upsert(
    {
      source_property_id: sourcePropertyId,
      target_property_id: input.targetPropertyId,
      caller_key: callerKey,
      last_seen_at: now.toISOString(),
      expires_at: new Date(now.getTime() + HINT_TTL_MS).toISOString(),
      consumed_at: null,
    },
    { onConflict: "source_property_id,target_property_id,caller_key" },
  )

  if (error) {
    if (isMissingRoutingSchema(error)) return false
    console.error("[3cx-shared-pbx] hint upsert failed", {
      targetPropertyId: input.targetPropertyId,
      code: error.code,
    })
    return false
  }

  return true
}

export type SharedPbxJournalResolution = {
  propertyId: string
  hintId: string | null
  routed: boolean
}

/**
 * Risolve il tenant effettivo di un ReportCall.
 *
 * 3CX non espone il DID al template CRM. Per questo NON indoviniamo da numero,
 * contatto, agente o nome: deviamo dal tenant autenticato soltanto quando:
 *  - il target dichiara esplicitamente di condividere quel PBX/CRM;
 *  - un endpoint voce autenticato del target ha visto lo stesso chiamante;
 *  - l'ultimo evento voce cade dentro l'intervallo temporale della chiamata.
 */
export async function resolveSharedPbxJournalTarget(input: {
  sourcePropertyId: string
  callerNumber?: string | null
  direction: "inbound" | "outbound"
  startedAt?: string | null
  endedAt?: string | null
}): Promise<SharedPbxJournalResolution> {
  const fallback = { propertyId: input.sourcePropertyId, hintId: null, routed: false }
  if (input.direction !== "inbound") return fallback

  const callerKey = phoneMatchKey(input.callerNumber)
  if (!callerKey || !input.startedAt) return fallback

  const started = new Date(input.startedAt)
  if (Number.isNaN(started.getTime())) return fallback
  const ended = input.endedAt ? new Date(input.endedAt) : new Date()
  const effectiveEnd = Number.isNaN(ended.getTime()) ? new Date() : ended

  // Il request dell'agente vocale avviene dopo l'inizio della chiamata e prima
  // della sua fine. Aggiungo soltanto 60s al termine per tollerare clock/queue,
  // senza una finestra larga che potrebbe catturare una chiamata successiva.
  const latestAllowed = new Date(effectiveEnd.getTime() + 60_000).toISOString()
  const supabase = createServiceClient()
  const { data: hints, error } = await supabase
    .from("telephony_call_route_hints")
    .select("id, target_property_id, last_seen_at")
    .eq("source_property_id", input.sourcePropertyId)
    .eq("caller_key", callerKey)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .gte("last_seen_at", started.toISOString())
    .lte("last_seen_at", latestAllowed)
    .order("last_seen_at", { ascending: false })
    .limit(5)

  if (error) {
    if (isMissingRoutingSchema(error)) return fallback
    console.error("[3cx-shared-pbx] hint lookup failed", {
      sourcePropertyId: input.sourcePropertyId,
      code: error.code,
    })
    return fallback
  }

  for (const hint of hints ?? []) {
    const targetPropertyId = String(hint.target_property_id || "")
    if (!targetPropertyId || targetPropertyId === input.sourcePropertyId) continue

    const { data: mapping, error: mappingError } = await supabase
      .from("telephony_integrations")
      .select("property_id")
      .eq("property_id", targetPropertyId)
      .eq("provider", "3cx")
      .eq("is_active", true)
      .eq("shared_pbx_journal_property_id", input.sourcePropertyId)
      .maybeSingle()

    if (mappingError) {
      if (isMissingRoutingSchema(mappingError)) return fallback
      console.error("[3cx-shared-pbx] target mapping verification failed", {
        sourcePropertyId: input.sourcePropertyId,
        targetPropertyId,
        code: mappingError.code,
      })
      continue
    }
    if (!mapping) continue

    return { propertyId: targetPropertyId, hintId: String(hint.id), routed: true }
  }

  return fallback
}

/** Consuma l'hint solo dopo che il journal e' stato persistito con successo. */
export async function consumeSharedPbxRouteHint(hintId: string | null): Promise<void> {
  if (!hintId) return
  const supabase = createServiceClient()
  const { error } = await supabase
    .from("telephony_call_route_hints")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", hintId)
    .is("consumed_at", null)

  if (error && !isMissingRoutingSchema(error)) {
    console.error("[3cx-shared-pbx] hint consume failed", { hintId, code: error.code })
  }
}
