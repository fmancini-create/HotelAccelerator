import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

export type PipelineSalesRow = {
  id: string
  conversation_id: string | null
  quoted_rate_cents: number | null
  stage: string | null
  stage_set_by: string | null
  stage_set_at: string | null
}

export async function syncPipelineSalesAttribution(
  sb: SupabaseClient,
  propertyId: string,
  row: PipelineSalesRow,
  action?: { actorId: string | null; at: string; quoteValueWasSet: boolean },
): Promise<void> {
  const { data: existing, error: existingError } = await sb
    .from("crm_operator_sales_attributions")
    .select(
      "id,user_id,quote_sent_at,closed_at,amount_cents,attribution_source,verification_status,confidence,verified_by",
    )
    .eq("property_id", propertyId)
    .eq("date_request_id", row.id)
    .maybeSingle()
  if (existingError) throw existingError

  // Una correzione amministrativa esplicita non viene mai sovrascritta da una
  // successiva modifica della pipeline. L'importo viene comunque riallineato se
  // cambia nella fonte CRM, a meno che l'admin lo abbia valorizzato manualmente.
  const lockedByAdmin = Boolean(existing?.verified_by) || existing?.attribution_source === "manual"
  if (lockedByAdmin) return

  const now = action?.at ?? row.stage_set_at ?? new Date().toISOString()
  const explicitStageActor = row.stage_set_by ?? null
  const quoteActor = existing?.user_id ?? explicitStageActor ?? action?.actorId ?? null
  const quoteAction =
    row.stage === "preventivo_inviato" ||
    (Boolean(action?.quoteValueWasSet) && Boolean(row.quoted_rate_cents && row.quoted_rate_cents > 0))
  const won = row.stage === "confermata"
  const lost = row.stage === "persa"

  if (!existing && !quoteAction && !won && !lost) return

  const userId = existing?.user_id ?? (quoteAction || won ? quoteActor : null)
  const quoteSentAt = existing?.quote_sent_at ?? (quoteAction ? now : null)
  const closedAt = won ? row.stage_set_at ?? now : lost ? null : existing?.closed_at ?? null
  const amountCents = row.quoted_rate_cents && row.quoted_rate_cents > 0 ? row.quoted_rate_cents : existing?.amount_cents ?? null

  const shouldConfirm = Boolean(userId && (quoteAction || won || existing?.verification_status === "confirmed"))
  const verificationStatus = shouldConfirm ? "confirmed" : existing?.verification_status ?? "unattributed"
  const confidence = shouldConfirm ? 100 : existing?.confidence ?? 0

  const { error } = await sb.from("crm_operator_sales_attributions").upsert(
    {
      property_id: propertyId,
      date_request_id: row.id,
      conversation_id: row.conversation_id,
      user_id: userId,
      quote_sent_at: quoteSentAt,
      closed_at: closedAt,
      amount_cents: amountCents,
      attribution_source: "pipeline_stage",
      confidence,
      verification_status: verificationStatus,
      evidence: {
        operator_match: quoteAction ? "pipeline_quote_actor" : won ? "pipeline_stage_set_by" : "pipeline_existing",
        close_signal: won ? "human_stage_confirmed" : lost ? "human_stage_lost" : "none",
        quote_signal: quoteAction ? "human_pipeline_action" : quoteSentAt ? "existing" : "none",
      },
      scanned_at: now,
      updated_at: now,
    },
    { onConflict: "property_id,date_request_id" },
  )
  if (error) throw error
}
