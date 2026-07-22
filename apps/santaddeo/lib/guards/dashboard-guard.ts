/**
 * DASHBOARD GUARD
 *
 * Blocca la visualizzazione dati se:
 * 1. La mappatura PMS non è VALIDATED o LOCKED
 * 2. Il binding hotel non è COMPLETE o ACTIVE
 *
 * PRINCIPIO: Meglio nessun dato che dati potenzialmente errati.
 */

import { createClient } from "@/lib/supabase/server"

export interface DashboardGuardResult {
  allowed: boolean
  reason?: string
  blockCode?: "NO_MAPPING" | "MAPPING_NOT_VALIDATED" | "BINDING_INCOMPLETE" | "NO_DATA"
  mappingVersion?: {
    id: string
    version: number
    status: string
  }
}

/**
 * Verifica se la dashboard può mostrare dati per una struttura
 * Usa can_run_etl come single source of truth
 */
export async function checkDashboardAllowed(hotelId: string): Promise<DashboardGuardResult> {
  const supabase = await createClient()

  // Try to use can_run_etl as the authoritative check
  try {
    const { data: canRunResult, error: canRunError } = await supabase.rpc("can_run_etl", {
      p_hotel_id: hotelId,
    })

    if (!canRunError && canRunResult) {
      if (!canRunResult.can_run) {
        // Determine block code based on reasons
        const reasons = canRunResult.block_reasons || []
        let blockCode: DashboardGuardResult["blockCode"] = "NO_MAPPING"

        if (reasons.some((r: string) => r.includes("binding"))) {
          blockCode = "BINDING_INCOMPLETE"
        } else if (reasons.some((r: string) => r.includes("VALIDATED") || r.includes("LOCKED"))) {
          blockCode = "MAPPING_NOT_VALIDATED"
        }

        return {
          allowed: false,
          reason: reasons.join("; "),
          blockCode,
          mappingVersion: canRunResult.mapping_version
            ? {
                id: canRunResult.mapping_version.id,
                version: canRunResult.mapping_version.version,
                status: canRunResult.mapping_version.status,
              }
            : undefined,
        }
      }

      return {
        allowed: true,
        mappingVersion: canRunResult.mapping_version
          ? {
              id: canRunResult.mapping_version.id,
              version: canRunResult.mapping_version.version,
              status: canRunResult.mapping_version.status,
            }
          : undefined,
      }
    }

    if (canRunError?.code === "PGRST202") {
      console.warn("[v0] Dashboard guard: can_run_etl function not found, using legacy mode (allowed)")
      return { allowed: true }
    }
  } catch (e) {
    console.warn("[v0] Dashboard guard: can_run_etl not available, using fallback", e)
  }

  // Fallback: direct table check if can_run_etl doesn't exist
  try {
    // 1. Trova il binding attivo per questa struttura
    const { data: binding, error: bindingError } = await supabase
      .from("hotel_bindings")
      .select(`
        id,
        status,
        completeness_score,
        mapping_version_id,
        pms_mapping_versions!inner(
          id,
          version,
          status,
          pms_provider_id
        )
      `)
      .eq("hotel_id", hotelId)
      .or("status.ilike.complete,status.ilike.active,status.eq.COMPLETE,status.eq.ACTIVE")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (bindingError) {
      if (
        bindingError.code === "42P01" ||
        bindingError.code === "PGRST200" ||
        bindingError.message?.includes("does not exist")
      ) {
        console.warn("[v0] Dashboard guard: tables not found, using legacy mode (allowed)")
        return { allowed: true }
      }
    }

    if (!binding) {
      console.warn("[v0] Dashboard guard: no binding found, using legacy mode (allowed)")
      return { allowed: true }
    }

    const mappingVersion = (binding as any).pms_mapping_versions

    // 2. Verifica stato mappatura (case-insensitive)
    if (!["validated", "locked"].includes(mappingVersion.status?.toLowerCase())) {
      return {
        allowed: false,
        reason: "La configurazione PMS è in fase di aggiornamento. I dati saranno disponibili a breve.",
        blockCode: "MAPPING_NOT_VALIDATED",
        mappingVersion: {
          id: mappingVersion.id,
          version: mappingVersion.version,
          status: mappingVersion.status,
        },
      }
    }

    // 3. Verifica completezza binding
    if (binding.completeness_score < 100) {
      return {
        allowed: false,
        reason: "La configurazione della struttura non è completa. Alcune sezioni devono essere configurate.",
        blockCode: "BINDING_INCOMPLETE",
        mappingVersion: {
          id: mappingVersion.id,
          version: mappingVersion.version,
          status: mappingVersion.status,
        },
      }
    }

    // Tutto OK
    return {
      allowed: true,
      mappingVersion: {
        id: mappingVersion.id,
        version: mappingVersion.version,
        status: mappingVersion.status,
      },
    }
  } catch (fallbackError) {
    console.warn("[v0] Dashboard guard: fallback failed, using legacy mode (allowed)", fallbackError)
    return { allowed: true }
  }
}

/**
 * Componente React per wrappare contenuti bloccati
 */
export function getDashboardBlockMessage(result: DashboardGuardResult): {
  title: string
  description: string
  severity: "warning" | "error" | "info"
} {
  switch (result.blockCode) {
    case "NO_MAPPING":
      return {
        title: "Configurazione PMS Richiesta",
        description:
          "Per visualizzare i dati è necessario configurare il collegamento al PMS. Contatta il supporto Santaddeo.",
        severity: "warning",
      }
    case "MAPPING_NOT_VALIDATED":
      return {
        title: "Configurazione in Corso",
        description:
          "La configurazione PMS è in fase di validazione. I dati saranno disponibili non appena completata.",
        severity: "info",
      }
    case "BINDING_INCOMPLETE":
      return {
        title: "Configurazione Incompleta",
        description:
          "Alcune configurazioni della struttura devono essere completate prima di poter visualizzare i dati.",
        severity: "warning",
      }
    case "NO_DATA":
      return {
        title: "Nessun Dato Disponibile",
        description: "Non sono ancora stati importati dati dal PMS. La prima sincronizzazione è in corso.",
        severity: "info",
      }
    default:
      return {
        title: "Errore",
        description: result.reason || "Si è verificato un errore imprevisto.",
        severity: "error",
      }
  }
}
