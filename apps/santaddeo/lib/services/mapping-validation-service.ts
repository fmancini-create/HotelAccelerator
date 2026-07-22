/**
 * MAPPING VALIDATION SERVICE
 *
 * Servizio per la validazione delle mappature PMS → RMS
 * Implementa la logica di checklist, stati e blocchi ETL
 */

import { createClient } from "@/lib/supabase/server"

// ============================================
// TYPES
// ============================================

export type PmsMappingStatus = "DRAFT" | "VALIDATED" | "LOCKED" | "DEPRECATED"
export type HotelBindingStatus = "INCOMPLETE" | "COMPLETE" | "ACTIVE" | "SUSPENDED"
export type EtlBlockType = "PMS_MAPPING" | "HOTEL_BINDING" | "CRITICAL_ENTITY" | "API_ERROR"
export type BlockSeverity = "ERROR" | "WARNING" | "INFO"

export interface CriticalEntityCheck {
  entityType: string
  mapped: number
  required: number
  complete: boolean
  missingFields?: string[]
}

export interface MappingChecklist {
  criticalEntities: Record<string, CriticalEntityCheck>
  completenessPercentage: number
  isComplete: boolean
  blockers: EtlBlocker[]
}

export interface EtlBlocker {
  type: EtlBlockType
  severity: BlockSeverity
  message: string
  resolution: string
}

export interface EtlBlockCheck {
  canRun: boolean
  blockers: EtlBlocker[]
}

export interface MappingVersion {
  id: string
  pmsProviderId: string
  versionNumber: number
  status: PmsMappingStatus
  validFrom: Date | null
  validTo: Date | null
  checklistStatus: MappingChecklist
  createdBy: string | null
  createdAt: Date
  validatedBy: string | null
  validatedAt: Date | null
  lockedBy: string | null
  lockedAt: Date | null
  changeNotes: string | null
}

// ============================================
// CONFIGURAZIONE ENTITÀ CRITICHE
// ============================================

export const CRITICAL_ENTITIES_CONFIG = {
  reservation: {
    label: "Prenotazioni",
    requiredFields: [
      "booking_id",
      "check_in_date",
      "check_out_date",
      "status",
      "total_amount",
      "room_type_id",
      "guest_id",
      "created_at",
    ],
    minRequired: 8,
  },
  guest: {
    label: "Ospiti",
    requiredFields: ["first_name", "last_name", "email", "phone", "nationality", "document_type", "document_number"],
    minRequired: 5,
  },
  customer: {
    label: "Clienti",
    requiredFields: ["customer_id", "name", "email", "fiscal_code", "address"],
    minRequired: 3,
  },
  room_type: {
    label: "Tipologie Camera",
    requiredFields: ["room_type_id", "room_type_name", "base_capacity", "max_capacity"],
    minRequired: 4,
  },
  rate: {
    label: "Tariffe",
    requiredFields: ["rate_id", "rate_name", "board_type"],
    minRequired: 3,
  },
  availability: {
    label: "Disponibilità",
    requiredFields: ["date", "room_type_id", "available_count", "status"],
    minRequired: 4,
  },
  booking_status: {
    label: "Stati Prenotazione",
    requiredFields: [],
    requiredValues: ["confirmed", "cancelled", "pending", "checked_in", "checked_out"],
    minRequired: 5,
  },
} as const

// ============================================
// SERVICE CLASS
// ============================================

export class MappingValidationService {
  /**
   * Calcola la completezza della mappatura per un PMS
   */
  static async calculateMappingCompleteness(pmsProviderId: string): Promise<MappingChecklist> {
    const supabase = await createClient()

    // Ottieni il codice del PMS
    const { data: provider } = await supabase.from("pms_providers").select("code").eq("id", pmsProviderId).single()

    if (!provider) {
      throw new Error("PMS provider not found")
    }

    // Ottieni tutte le mappature per questo PMS
    const { data: mappings } = await supabase.from("pms_rms_mappings").select("*").eq("pms_provider", provider.code)

    const mappingsByEntity: Record<string, any[]> = {}
    ;(mappings || []).forEach((m) => {
      const entityType = m.pms_entity_type || m.entity_type
      if (!mappingsByEntity[entityType]) {
        mappingsByEntity[entityType] = []
      }
      mappingsByEntity[entityType].push(m)
    })

    // Calcola completezza per ogni entità critica
    const criticalEntities: Record<string, CriticalEntityCheck> = {}
    let totalRequired = 0
    let totalMapped = 0
    const blockers: EtlBlocker[] = []

    for (const [entityType, config] of Object.entries(CRITICAL_ENTITIES_CONFIG)) {
      const entityMappings = mappingsByEntity[entityType] || []
      const mappedCount = entityMappings.length
      const requiredCount = config.minRequired

      const missingFields: string[] = []
      if (config.requiredFields) {
        const mappedFields = entityMappings.map((m) => m.rms_code)
        config.requiredFields.forEach((field) => {
          if (!mappedFields.includes(field)) {
            missingFields.push(field)
          }
        })
      }

      const isComplete = mappedCount >= requiredCount && missingFields.length === 0

      criticalEntities[entityType] = {
        entityType,
        mapped: mappedCount,
        required: requiredCount,
        complete: isComplete,
        missingFields: missingFields.length > 0 ? missingFields : undefined,
      }

      totalRequired += requiredCount
      totalMapped += Math.min(mappedCount, requiredCount)

      if (!isComplete) {
        blockers.push({
          type: "CRITICAL_ENTITY",
          severity: "ERROR",
          message: `Entità "${config.label}" incompleta: ${mappedCount}/${requiredCount} campi mappati`,
          resolution:
            missingFields.length > 0
              ? `Mappare i campi mancanti: ${missingFields.join(", ")}`
              : `Completare la mappatura dell'entità "${config.label}"`,
        })
      }
    }

    const completenessPercentage = Math.round((totalMapped / Math.max(totalRequired, 1)) * 100)

    return {
      criticalEntities,
      completenessPercentage,
      isComplete: completenessPercentage >= 100 && blockers.length === 0,
      blockers,
    }
  }

  /**
   * Verifica se l'ETL può essere eseguito per una struttura
   */
  static async canRunEtl(hotelId: string): Promise<EtlBlockCheck> {
    const supabase = await createClient()
    const blockers: EtlBlocker[] = []

    // 1. Trova il binding hotel-PMS
    const { data: binding } = await supabase
      .from("hotel_bindings")
      .select("*, pms_providers(*)")
      .eq("hotel_id", hotelId)
      .single()

    if (!binding) {
      // Prova a trovare tramite pms_integrations
      const { data: integration } = await supabase
        .from("pms_integrations")
        .select("*, pms_providers(*)")
        .eq("hotel_id", hotelId)
        .eq("is_active", true)
        .single()

      if (!integration) {
        return {
          canRun: false,
          blockers: [
            {
              type: "HOTEL_BINDING",
              severity: "ERROR",
              message: "Nessun PMS associato alla struttura",
              resolution: "Configurare il collegamento PMS nella sezione Connettori",
            },
          ],
        }
      }
    }

    const pmsProviderId = binding?.pms_provider_id || binding?.pms_providers?.id

    if (!pmsProviderId) {
      return {
        canRun: false,
        blockers: [
          {
            type: "HOTEL_BINDING",
            severity: "ERROR",
            message: "PMS provider non trovato",
            resolution: "Verificare la configurazione del connettore PMS",
          },
        ],
      }
    }

    // 2. Verifica stato mappatura PMS
    const { data: mappingVersion } = await supabase
      .from("pms_mapping_versions")
      .select("*")
      .eq("pms_provider_id", pmsProviderId)
      .in("status", ["VALIDATED", "LOCKED"])
      .order("version_number", { ascending: false })
      .limit(1)
      .single()

    if (!mappingVersion) {
      blockers.push({
        type: "PMS_MAPPING",
        severity: "ERROR",
        message: "Mappatura PMS non validata",
        resolution: "Completare e validare la mappatura PMS nella sezione SuperAdmin > Connettori",
      })
    }

    // 3. Verifica completezza mappatura
    const checklist = await this.calculateMappingCompleteness(pmsProviderId)
    if (!checklist.isComplete) {
      blockers.push(...checklist.blockers)
    }

    // 4. Verifica stato binding hotel (se esiste la tabella)
    if (binding && binding.status === "INCOMPLETE") {
      blockers.push({
        type: "HOTEL_BINDING",
        severity: "ERROR",
        message: "Configurazione struttura incompleta",
        resolution: "Completare la mappatura delle tipologie camera e tariffe",
      })
    }

    return {
      canRun: blockers.filter((b) => b.severity === "ERROR").length === 0,
      blockers,
    }
  }

  /**
   * Valida una mappatura PMS (passa da DRAFT a VALIDATED)
   */
  static async validateMapping(versionId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    // Ottieni la versione
    const { data: version } = await supabase.from("pms_mapping_versions").select("*").eq("id", versionId).single()

    if (!version) {
      return { success: false, error: "Versione mappatura non trovata" }
    }

    if (version.status !== "DRAFT") {
      return { success: false, error: "Solo le mappature in stato DRAFT possono essere validate" }
    }

    // Calcola completezza
    const checklist = await this.calculateMappingCompleteness(version.pms_provider_id)

    if (!checklist.isComplete) {
      return {
        success: false,
        error: `Mappatura incompleta (${checklist.completenessPercentage}%). Completare le entità critiche mancanti.`,
      }
    }

    // Aggiorna stato
    const { error } = await supabase
      .from("pms_mapping_versions")
      .update({
        status: "VALIDATED",
        validated_by: userId,
        validated_at: new Date().toISOString(),
        valid_from: new Date().toISOString(),
        checklist_status: checklist,
      })
      .eq("id", versionId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  }

  /**
   * Blocca una mappatura PMS (passa da VALIDATED a LOCKED)
   */
  static async lockMapping(versionId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    const { data: version } = await supabase.from("pms_mapping_versions").select("*").eq("id", versionId).single()

    if (!version) {
      return { success: false, error: "Versione mappatura non trovata" }
    }

    if (version.status !== "VALIDATED") {
      return { success: false, error: "Solo le mappature VALIDATED possono essere bloccate" }
    }

    const { error } = await supabase
      .from("pms_mapping_versions")
      .update({
        status: "LOCKED",
        locked_by: userId,
        locked_at: new Date().toISOString(),
      })
      .eq("id", versionId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  }

  /**
   * Crea nuova versione da una esistente
   */
  static async createNewVersion(
    pmsProviderId: string,
    userId: string,
    changeNotes?: string,
  ): Promise<{ success: boolean; versionId?: string; error?: string }> {
    const supabase = await createClient()

    // Trova l'ultima versione
    const { data: lastVersion } = await supabase
      .from("pms_mapping_versions")
      .select("version_number")
      .eq("pms_provider_id", pmsProviderId)
      .order("version_number", { ascending: false })
      .limit(1)
      .single()

    const newVersionNumber = (lastVersion?.version_number || 0) + 1

    // Crea nuova versione
    const { data: newVersion, error } = await supabase
      .from("pms_mapping_versions")
      .insert({
        pms_provider_id: pmsProviderId,
        version_number: newVersionNumber,
        status: "DRAFT",
        created_by: userId,
        change_notes: changeNotes || `Versione ${newVersionNumber} creata`,
      })
      .select()
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, versionId: newVersion.id }
  }
}

export default MappingValidationService
