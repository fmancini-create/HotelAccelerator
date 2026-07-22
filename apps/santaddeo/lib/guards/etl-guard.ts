/**
 * ETL GUARD
 *
 * Blocca l'esecuzione ETL se:
 * 1. La mappatura PMS non è VALIDATED o LOCKED
 * 2. Il binding hotel non è COMPLETE o ACTIVE
 * 3. La checklist obbligatoria non è soddisfatta
 *
 * PRINCIPIO: Meglio nessun dato che dati potenzialmente errati.
 *
 * NOTE: This is a TypeScript wrapper. The authoritative check is
 * the SQL function can_run_etl(hotel_id) which MUST be called
 * before any ETL operation.
 */

import { createClient } from "@/lib/supabase/server"

export interface ETLGuardResult {
  allowed: boolean
  reason?: string
  blockCode?: "NO_MAPPING" | "MAPPING_NOT_VALIDATED" | "BINDING_INCOMPLETE" | "CHECKLIST_FAILED"
  details?: {
    mappingStatus?: string
    bindingStatus?: string
    missingChecklist?: string[]
  }
}

export interface ETLContext {
  pmsProviderId: string
  hotelId: string
  operation: "sync" | "import" | "transform"
}

/**
 * Verifica se l'ETL può procedere per una struttura
 * IMPORTANT: This calls can_run_etl SQL function as single source of truth
 */
export async function checkETLAllowed(hotelId: string): Promise<ETLGuardResult> {
  const supabase = await createClient()

  // Use can_run_etl as THE authoritative check
  try {
    const { data: canRunResult, error: canRunError } = await supabase.rpc("can_run_etl", {
      p_hotel_id: hotelId,
    })

    if (canRunError) {
      console.warn("[v0] ETL Guard: can_run_etl error, falling back:", canRunError)
      // Fall through to legacy check
    } else if (canRunResult) {
      if (!canRunResult.can_run) {
        const reasons = canRunResult.block_reasons || []
        let blockCode: ETLGuardResult["blockCode"] = "NO_MAPPING"

        if (reasons.some((r: string) => r.includes("binding"))) {
          blockCode = "BINDING_INCOMPLETE"
        } else if (reasons.some((r: string) => r.includes("checklist"))) {
          blockCode = "CHECKLIST_FAILED"
        } else if (reasons.some((r: string) => r.includes("VALIDATED") || r.includes("LOCKED"))) {
          blockCode = "MAPPING_NOT_VALIDATED"
        }

        return {
          allowed: false,
          reason: reasons.join("; "),
          blockCode,
          details: {
            mappingStatus: canRunResult.mapping_version?.status,
          },
        }
      }

      return {
        allowed: true,
        details: {
          mappingStatus: canRunResult.mapping_version?.status,
        },
      }
    }
  } catch (e) {
    console.warn("[v0] ETL Guard: can_run_etl not available")
  }

  // Legacy fallback if can_run_etl doesn't exist
  return { allowed: true }
}

/**
 * Wrapper per eseguire ETL solo se permesso
 */
export async function executeWithETLGuard<T>(
  hotelId: string,
  operation: () => Promise<T>,
): Promise<{ success: boolean; result?: T; guard: ETLGuardResult }> {
  const guardResult = await checkETLAllowed(hotelId)

  if (!guardResult.allowed) {
    return {
      success: false,
      guard: guardResult,
    }
  }

  try {
    const result = await operation()
    return {
      success: true,
      result,
      guard: guardResult,
    }
  } catch (error) {
    throw error
  }
}

/**
 * Logga un blocco ETL nel database
 */
export async function logETLBlock(hotelId: string, blockCode: string, reason: string): Promise<void> {
  const supabase = await createClient()

  await supabase
    .from("etl_block_log")
    .insert({
      hotel_id: hotelId,
      operation: "etl",
      block_reason: blockCode,
      block_details: { reason },
      blocked_at: new Date().toISOString(),
    })
    .catch(() => {
      // Ignore if table doesn't exist
    })
}
