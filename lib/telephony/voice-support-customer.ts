import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { findCustomerProductCode } from "@/lib/customer-codes/registry"
import type { SuiteProductKey } from "@/lib/customer-codes/product"
import { CENTRAL_SUPPORT_SLUG, type SupportAfterHoursMode } from "@/lib/telephony/voice-support"

export interface VoiceSupportCustomer {
  propertyId: string
  propertyName: string
  customerCode: string
  plan: string | null
  supportAfterHoursMode: SupportAfterHoursMode
  supportAfterHoursExtension: string | null
}

/**
 * Il centralino centrale puo' interrogare questa directory; le integrazioni
 * 3CX dei singoli tenant no. Per confermare la licenza possiamo pronunciare
 * soltanto il nome pubblico della struttura/azienda associata: non esponiamo
 * email, telefono, contatti personali o altri dati del cliente.
 */
export async function findVoiceSupportCustomer(
  customerCode: string,
  productKey: SuiteProductKey,
): Promise<VoiceSupportCustomer | null> {
  const resolved = await findCustomerProductCode(customerCode, productKey)
  if (!resolved) return null

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("properties")
    .select("id, name, plan, subscription_status, is_active, support_after_hours_mode, support_after_hours_extension")
    .eq("id", resolved.propertyId)
    .maybeSingle()

  if (error) throw error
  if (!data || data.is_active === false || !["active", "trial"].includes(data.subscription_status ?? "active")) return null

  const mode: SupportAfterHoursMode = ["plan_default", "on_call", "voicemail"].includes(data.support_after_hours_mode)
    ? (data.support_after_hours_mode as SupportAfterHoursMode)
    : "plan_default"

  return {
    propertyId: data.id,
    propertyName: String(data.name || "cliente 4BID").trim() || "cliente 4BID",
    customerCode: resolved.code,
    plan: data.plan,
    supportAfterHoursMode: mode,
    supportAfterHoursExtension: data.support_after_hours_extension,
  }
}

/** Solo il tenant aziendale 4 BID puo' fungere da centralino centrale. */
export async function isVoiceSupportHub(propertyId: string): Promise<boolean> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from("properties").select("slug, type").eq("id", propertyId).maybeSingle()
  if (error) throw error
  return data?.slug === CENTRAL_SUPPORT_SLUG && data.type === "company"
}

/**
 * Salva il messaggio in un unico backlog del tenant 4 BID, non nel tenant del
 * cliente: cosi' il team di supporto ha una coda centralizzata e puo' poi
 * entrare nel tenant corretto usando customer_property_id nei metadati.
 */
export async function createVoiceSupportMessage(input: {
  hubPropertyId: string
  customer: VoiceSupportCustomer
  callId: string
  productKey: string
  callerNumber?: string
  recordingReference?: string
  transcript?: string
}) {
  const supabase = createServiceClient()
  const description = [
    "Messaggio lasciato al centralino 3CX.",
    `Prodotto: ${input.productKey}`,
    input.callerNumber ? `Numero richiamabile: ${input.callerNumber}` : null,
    input.recordingReference ? `Registrazione: ${input.recordingReference}` : null,
    input.transcript ? `Trascrizione:\n${input.transcript}` : null,
  ]
    .filter(Boolean)
    .join("\n\n")

  const { data, error } = await supabase
    .from("todos")
    .upsert(
      {
        property_id: input.hubPropertyId,
        title: `Supporto telefonico ${input.customer.customerCode}`,
        description,
        status: "open",
        priority: "high",
        tags: ["supporto", "3cx", input.productKey],
        external_source: "3cx_voice_support",
        external_id: input.callId,
        external_data: {
          customer_property_id: input.customer.propertyId,
          customer_code: input.customer.customerCode,
          product_key: input.productKey,
          caller_number: input.callerNumber ?? null,
          recording_reference: input.recordingReference ?? null,
        },
      },
      { onConflict: "property_id,external_source,external_id" },
    )
    .select("id")
    .single()

  if (error) throw error
  return data
}
