/**
 * Servizio per analizzare automaticamente le API di un PMS
 * e scoprire le entità disponibili durante il test di connessione
 */

// Mapping degli endpoint Scidoo alle entità
export const SCIDOO_ENDPOINT_MAP: Record<string, { entity: string; description: string; critical: boolean }> = {
  // Account & Property
  "account/getInfo.php": { entity: "account", description: "Info account", critical: true },
  "account/getProperties.php": { entity: "property", description: "Lista strutture", critical: true },

  // Clienti & Persone
  "guests/getCustomers.php": { entity: "customer", description: "Clienti", critical: true },
  "guests/getGuests.php": { entity: "guest", description: "Ospiti", critical: true },
  "guests/getGuestTypes.php": { entity: "guest_type", description: "Tipi ospite", critical: false },

  // Alloggi
  "rooms/getRoomTypes.php": { entity: "room_type", description: "Tipologie camera", critical: true },
  "rooms/getRooms.php": { entity: "room", description: "Camere", critical: true },
  "rooms/getRoomStatus.php": { entity: "room_status", description: "Stato camere", critical: false },
  "rooms/getAvailability.php": { entity: "room_availability", description: "Disponibilità", critical: true },
  "rooms/getAvailabilityDetails.php": {
    entity: "room_availability_detail",
    description: "Dettagli disponibilità",
    critical: false,
  },
  "rooms/listDateTypeRoom.php": { entity: "list_date_type_room", description: "Date per tipo camera", critical: false },
  "rooms/listDateRoom.php": { entity: "list_date_room", description: "Date per camera", critical: false },
  "rooms/getBedPreferences.php": { entity: "bed_preference", description: "Preferenze letto", critical: false },

  // Prenotazioni
  "bookings/get.php": { entity: "reservation", description: "Prenotazioni", critical: true },
  "bookings/getRooms.php": { entity: "booking_room", description: "Camere prenotate", critical: true },
  "bookings/getRates.php": { entity: "booking_rate", description: "Tariffe prenotazione", critical: true },
  "bookings/getDayPrices.php": { entity: "booking_day_price", description: "Prezzi giornalieri", critical: true },
  "bookings/getPriceDetails.php": { entity: "booking_price_detail", description: "Dettagli prezzo", critical: false },
  "bookings/getExtras.php": { entity: "booking_extra", description: "Extra prenotazione", critical: true },
  "bookings/getPayments.php": { entity: "booking_payment", description: "Pagamenti", critical: true },
  "bookings/getNotes.php": { entity: "booking_note", description: "Note prenotazione", critical: false },
  "bookings/getAgencies.php": { entity: "booking_agency", description: "Agenzie booking", critical: false },
  "bookings/getOrigins.php": { entity: "booking_origin", description: "Origini booking", critical: false },
  "bookings/getGroups.php": { entity: "booking_group", description: "Gruppi prenotazione", critical: false },

  // Prezzi & Tariffe
  "prices/getRates.php": { entity: "rate", description: "Piani tariffari", critical: true },
  "prices/getArrangements.php": { entity: "arrangement", description: "Trattamenti", critical: true },
  "prices/getDayPrices.php": { entity: "day_price", description: "Prezzi giornalieri", critical: true },
  "prices/getPriceDetails.php": { entity: "price_detail", description: "Dettagli prezzo", critical: false },
  "prices/getDueAmounts.php": { entity: "due_amount", description: "Importi dovuti", critical: false },
  "prices/getCancellationPolicies.php": {
    entity: "cancellation_policy",
    description: "Politiche cancellazione",
    critical: false,
  },
  "prices/getDepositPolicies.php": { entity: "deposit_policy", description: "Politiche deposito", critical: false },

  // Preventivi
  "estimates/get.php": { entity: "estimate", description: "Preventivi", critical: false },
  "proposals/get.php": { entity: "proposal", description: "Proposte", critical: false },

  // Canali / Origini
  "agencies/get.php": { entity: "agency", description: "Agenzie", critical: true },
  "origins/get.php": { entity: "origin", description: "Origini/Canali", critical: true },

  // Servizi & Extra
  "services/getServices.php": { entity: "service", description: "Servizi", critical: false },
  "services/getOffers.php": { entity: "offer", description: "Offerte", critical: false },
  "services/getSupplements.php": { entity: "supplement", description: "Supplementi", critical: false },
  "services/getCompositions.php": {
    entity: "service_composition",
    description: "Composizione servizi",
    critical: false,
  },
  "services/getAvailability.php": {
    entity: "service_availability",
    description: "Disponibilità servizi",
    critical: false,
  },
  "services/getTimeSlots.php": { entity: "service_time_slot", description: "Fasce orarie", critical: false },

  // Metadati
  "tags/get.php": { entity: "tag", description: "Tag", critical: false },
  "categories/get.php": { entity: "category_group", description: "Gruppi categoria", critical: false },
  "info/get.php": { entity: "info", description: "Info aggiuntive", critical: false },

  // Media
  "media/getAlbums.php": { entity: "album", description: "Album foto", critical: false },
  "media/getVideos.php": { entity: "video", description: "Video", critical: false },

  // Fiscale
  "invoice/getTaxDocuments.php": { entity: "tax_document", description: "Documenti fiscali", critical: true },
  "invoice/getFees.php": { entity: "fee", description: "Commissioni", critical: false },
  "invoice/getAccountRevenue.php": { entity: "account_revenue", description: "Ricavi account", critical: true },
  "invoice/getSuspendedInvoices.php": { entity: "suspended_invoice", description: "Fatture sospese", critical: false },
  "invoice/getFiscalProduction.php": { entity: "fiscal_production", description: "Produzione fiscale", critical: true },
}

// Mapping dei parametri specifici per ogni endpoint Scidoo
const SCIDOO_ENDPOINT_PARAMS: Record<string, object | null> = {
  "account/getInfo.php": {}, // no params needed
  "account/getProperties.php": {},
  "rooms/getRoomTypes.php": {}, // accepts: language, room_type_id (optional)
  "rooms/getRooms.php": {},
  "rooms/getAvailability.php": {
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  },
  "bookings/get.php": {
    checkin_from: new Date().toISOString().split("T")[0],
  },
  "prices/getRates.php": {},
  "guests/getGuestTypes.php": {},
  "services/getServices.php": {},
  "invoice/getFiscalProduction.php": {
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  },
}

// Analizza documentazione API testuale e estrae gli endpoint
export function parseApiDocumentation(docText: string): {
  endpoints: string[]
  capabilities: {
    hasWebhook: boolean
    hasVersioning: boolean
    hasDeltaSync: boolean
    hasLastModified: boolean
  }
} {
  const endpoints: string[] = []
  const capabilities = {
    hasWebhook: false,
    hasVersioning: false,
    hasDeltaSync: false,
    hasLastModified: false,
  }

  // Cerca endpoint nel testo (pattern comuni)
  const endpointPatterns = [
    /(?:GET|POST|PUT|DELETE|PATCH)\s+[/\w\-.]+\.php/gi,
    /\/api\/v\d+\/[\w\-/]+\.php/gi,
    /[\w-]+\/[\w-]+\.php/gi,
    /endpoint[:\s]+[\w\-/.]+/gi,
  ]

  for (const pattern of endpointPatterns) {
    const matches = docText.match(pattern) || []
    for (const match of matches) {
      // Pulisci il match
      const cleanEndpoint = match
        .replace(/^(GET|POST|PUT|DELETE|PATCH)\s+/i, "")
        .replace(/^\/api\/v\d+\//, "")
        .replace(/^endpoint[:\s]+/i, "")
        .trim()

      if (cleanEndpoint && !endpoints.includes(cleanEndpoint)) {
        endpoints.push(cleanEndpoint)
      }
    }
  }

  // Cerca capabilities nel testo
  if (/webhook/i.test(docText)) capabilities.hasWebhook = true
  if (/version|v\d+/i.test(docText)) capabilities.hasVersioning = true
  if (/delta|incremental|changes/i.test(docText)) capabilities.hasDeltaSync = true
  if (/last.?modified|updated.?at|modified.?date/i.test(docText)) capabilities.hasLastModified = true

  return { endpoints, capabilities }
}

// Risultato del test di un singolo endpoint
export interface EndpointTestResult {
  endpoint_path: string
  entity: string
  description: string
  is_critical: boolean
  is_available: boolean
  status: "success" | "error" | "not_tested"
  error?: string
  sample_count?: number // quanti record ha restituito
}

// Verifica quali endpoint sono effettivamente accessibili
// Testa TUTTI gli endpoint del PMS, non solo quelli critici
export async function discoverAvailableEndpoints(
  baseUrl: string,
  apiKey: string,
  pmsCode: string,
): Promise<{
  available: string[]
  unavailable: string[]
  entities: string[]
  criticalMissing: string[]
  endpointResults: EndpointTestResult[]
}> {
  const available: string[] = []
  const unavailable: string[] = []
  const entities: string[] = []
  const criticalMissing: string[] = []
  const endpointResults: EndpointTestResult[] = []

  if (pmsCode === "scidoo") {
    // Test ALL Scidoo endpoints, not just critical ones
    const allEndpoints = Object.keys(SCIDOO_ENDPOINT_MAP)

    for (const endpoint of allEndpoints) {
      const mapping = SCIDOO_ENDPOINT_MAP[endpoint]
      const result: EndpointTestResult = {
        endpoint_path: endpoint,
        entity: mapping.entity,
        description: mapping.description,
        is_critical: mapping.critical,
        is_available: false,
        status: "not_tested",
      }

      try {
        const params = SCIDOO_ENDPOINT_PARAMS[endpoint] || {}

        const response = await fetch(`${baseUrl}/${endpoint}`, {
          method: "POST",
          headers: {
            "Api-Key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(10000), // 10s timeout per endpoint
        })

        if (response.ok || response.status === 200) {
          available.push(endpoint)
          result.is_available = true
          result.status = "success"
          if (!entities.includes(mapping.entity)) {
            entities.push(mapping.entity)
          }
          // Try to get sample count from response
          try {
            const data = await response.json()
            if (Array.isArray(data)) {
              result.sample_count = data.length
            } else if (data && typeof data === "object") {
              // Look for common array fields in the response
              const arrayField = Object.values(data).find(v => Array.isArray(v))
              if (Array.isArray(arrayField)) {
                result.sample_count = arrayField.length
              }
            }
          } catch {
            // ignore parse errors
          }
        } else {
          unavailable.push(endpoint)
          result.status = "error"
          result.error = `HTTP ${response.status}`
          if (mapping.critical) {
            criticalMissing.push(mapping.entity)
          }
        }
      } catch (err) {
        unavailable.push(endpoint)
        result.status = "error"
        result.error = err instanceof Error ? err.message : "Connection failed"
        if (mapping.critical) {
          criticalMissing.push(mapping.entity)
        }
      }

      endpointResults.push(result)
    }
  }

  return { available, unavailable, entities, criticalMissing, endpointResults }
}

// Tipo di risultato della discovery
export interface ApiDiscoveryResult {
  success: boolean
  message: string
  accountInfo?: {
    name: string
    email?: string
    properties?: { id: number; name: string }[]
  }
  availableEndpoints: string[]
  unavailableEndpoints: string[]
  entities: string[]
  criticalMissing: string[]
  endpointResults?: EndpointTestResult[]
  capabilities: {
    hasWebhook: boolean
    hasVersioning: boolean
    hasDeltaSync: boolean
    hasLastModified: boolean
    requiresFullHistorization: boolean
    syncStrategy: "full" | "delta" | "webhook"
  }
}
