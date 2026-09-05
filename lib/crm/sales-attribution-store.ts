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

type PipelineSalesAction = {
  actorId: string | null
  at: string
  stageWasTouched: boolean
  quoteValueWasTouched: boolean
}

export async function syncPipelineSalesAttribution(
  sb: SupabaseClient,
  propertyId: string,
  row: PipelineSalesRow,
  action?: PipelineSalesAction,
): Promise<void> {
  const { data: existing, error: existingError } = await sb
    .from("crm_operator_sales_attributions")
    .select(
      "id,user_id,quote_sent_at,closed_at,amount_cents,attribution_source,verification_status,confidence,verified_by,evidence",
    )
    .eq("property_id", propertyId)
    .eq("date_request_id", row.id)
    .maybeSingle()
  if (existingError) throw existingError

  // Una correzione amministrativa esplicita non viene mai sovrascritta da una
  // successiva modifica della pipeline.
  const lockedByAdmin = Boolean(existing?.verified_by) || existing?.attribution_source === "manual"
  if (lockedByAdmin) return

  const now = action?.at ?? row.stage_set_at ?? new Date().toISOString()
  const explicitStageActor = row.stage_set_by ?? null
  const quoteAction = row.stage === "preventivo_inviato" && Boolean(explicitStageActor)
  const wonAction = Boolean(action?.stageWasTouched && row.stage === "confermata")
  const nonWonStageAction = Boolean(action?.stageWasTouched && row.stage !== "confermata")
  const quoteValueTouched = Boolean(action?.quoteValueWasTouched)

  if (!existing && !quoteAction && !wonAction && !nonWonStageAction && !quoteValueTouched) return

  let userId = existing?.user_id ?? null
  let verificationStatus = existing?.verification_status ?? "unattributed"
  let confidence = existing?.confidence ?? 0
  let attributionSource = existing?.attribution_source ?? "pipeline_stage"
  let operatorMatch =
    existing?.evidence && typeof existing.evidence === "object" && "operator_match" in existing.evidence
      ? String((existing.evidence as Record<string, unknown>).operator_match ?? "existing")
      : "unresolved"

  // `preventivo_inviato` e una decisione umana esplicita sul momento del
  // preventivo: qui possiamo attribuire il preventivo all'autore della fase.
  // Inserire soltanto il valore economico, invece, non prova chi abbia scritto.
  if (quoteAction && explicitStageActor) {
    userId = existing?.user_id ?? explicitStageActor
    if (!existing?.user_id) {
      verificationStatus = "confirmed"
      confidence = 100
      attributionSource = "pipeline_stage"
      operatorMatch = "pipeline_quote_actor"
    }
  }

  // Se qualcuno marca direttamente Confermata senza una precedente attribuzione
  // del preventivo, e solo un candidato: non gli assegniamo automaticamente il
  // merito che potrebbe appartenere a chi ha scritto la proposta.
  if (wonAction && !userId && explicitStageActor) {
    userId = explicitStageActor
    verificationStatus = "needs_review"
    confidence = 75
    attributionSource = "pipeline_stage"
    operatorMatch = "pipeline_stage_actor_candidate"
  }

  const quoteSentAt = existing?.quote_sent_at ?? (quoteAction ? row.stage_set_at ?? now : null)
  const closedAt = wonAction
    ? row.stage_set_at ?? now
    : nonWonStageAction
      ? null
      : existing?.closed_at ?? null
  const amountCents = quoteValueTouched
    ? row.quoted_rate_cents
    : row.quoted_rate_cents && row.quoted_rate_cents > 0
      ? row.quoted_rate_cents
      : existing?.amount_cents ?? null

  const existingEvidence =
    existing?.evidence && typeof existing.evidence === "object"
      ? (existing.evidence as Record<string, unknown>)
      : {}

  const { error } = await sb.from("crm_operator_sales_attributions").upsert(
    {
      property_id: propertyId,
      date_request_id: row.id,
      conversation_id: row.conversation_id,
      user_id: userId,
      quote_sent_at: quoteSentAt,
      closed_at: closedAt,
      amount_cents: amountCents,
      attribution_source: attributionSource,
      confidence,
      verification_status: verificationStatus,
      evidence: {
        ...existingEvidence,
        operator_match: operatorMatch,
        pipeline_close_signal: wonAction
          ? "human_stage_confirmed"
          : nonWonStageAction
            ? row.stage === "persa"
              ? "human_stage_lost"
              : "human_stage_reopened"
            : "unchanged",
        pipeline_quote_signal: quoteAction ? "human_stage_quote_sent" : quoteValueTouched ? "amount_only" : "unchanged",
      },
      scanned_at: now,
      updated_at: now,
    },
    { onConflict: "property_id,date_request_id" },
  )
  if (error) throw error
}
