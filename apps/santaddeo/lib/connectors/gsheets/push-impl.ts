/**
 * Implementazione push tariffe via Google Sheets.
 *
 * Estratta da lib/pricing/push-prices.ts il 20/05/2026 durante il refactor
 * agnostico (PMSConnector + registry). Logica identica all'originale.
 *
 * Usato per Bedzzle e altri PMS senza API native: i prezzi vengono scritti
 * sulla matrice prezzi del Google Sheet di prenotazione, e il PMS li
 * legge da li' col suo polling (responsabilita' fuori dal nostro scope).
 *
 * Non chiamare direttamente: passa attraverso gsheetsConnector.pushRates.
 */

import { GSheetsWriter } from "./writer"
import type { PriceChange } from "@/lib/pricing/calculate-suggested-price"
import type { PMSIntegration, PushResult, RoomTypeMapping } from "../connector"

export async function pushViaGSheets(
  pms: PMSIntegration,
  changes: PriceChange[],
  roomTypeMappings: RoomTypeMapping[],
): Promise<PushResult> {
  console.log(`[v0] [pushViaGSheets] Starting GSheets push for ${changes.length} changes`)

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    console.error(`[v0] [pushViaGSheets] GOOGLE_SERVICE_ACCOUNT_KEY non configurata`)
    return {
      success: false,
      method: "gsheets",
      cellsOrRecords: 0,
      errors: ["GOOGLE_SERVICE_ACCOUNT_KEY non configurata. Aggiungerla nelle variabili d'ambiente."],
    }
  }

  // gsheets_mapping is stored inside config (JSONB column) as config.gsheets_mapping
  const configObj = pms.config as Record<string, any> | undefined
  const mapping = configObj?.gsheets_mapping as Record<string, any> | undefined

  console.log(
    `[v0] [pushViaGSheets] Config keys: ${configObj ? Object.keys(configObj).join(", ") : "null"}`,
  )
  console.log(
    `[v0] [pushViaGSheets] gsheets_mapping found: ${!!mapping}, keys: ${mapping ? Object.keys(mapping).join(", ") : "null"}`,
  )

  if (!mapping) {
    return {
      success: false,
      method: "gsheets",
      cellsOrRecords: 0,
      errors: ["gsheets_mapping non configurato per questo hotel. Verificare config in pms_integrations."],
    }
  }

  const prezziMapping = mapping["prezzi_matrice"]
  if (!prezziMapping?.sheetTab || !prezziMapping?.matrixMeta) {
    console.error(
      `[v0] [pushViaGSheets] prezzi_matrice mapping incompleto:`,
      JSON.stringify(prezziMapping || null),
    )
    return {
      success: false,
      method: "gsheets",
      cellsOrRecords: 0,
      errors: [
        `Mapping prezzi_matrice incompleto: sheetTab=${prezziMapping?.sheetTab || "mancante"}, matrixMeta=${
          prezziMapping?.matrixMeta ? "presente" : "mancante"
        }`,
      ],
    }
  }

  console.log(
    `[v0] [pushViaGSheets] Tab: ${prezziMapping.sheetTab}, rateColumns: ${prezziMapping.matrixMeta?.rateColumns?.length || 0}`,
  )

  // spreadsheetId is a top-level column on pms_integrations, not inside config
  const spreadsheetId = (pms as any).gsheet_spreadsheet_id as string
  if (!spreadsheetId) {
    console.error(`[v0] [pushViaGSheets] gsheet_spreadsheet_id mancante`)
    return {
      success: false,
      method: "gsheets",
      cellsOrRecords: 0,
      errors: ["gsheet_spreadsheet_id non configurato nella integrazione PMS"],
    }
  }

  console.log(`[v0] [pushViaGSheets] Spreadsheet ID: ${spreadsheetId}`)

  const writer = new GSheetsWriter(spreadsheetId, prezziMapping.sheetTab, prezziMapping.matrixMeta)

  const updates = changes
    .map((c) => {
      const rt = roomTypeMappings.find((r) => r.id === c.roomTypeId)
      return {
        date: c.date,
        roomTypeCode: rt?.code || "",
        occupancy: c.occupancy,
        price: c.suggestedPrice,
      }
    })
    .filter((u) => u.roomTypeCode)

  if (updates.length === 0) {
    return {
      success: false,
      method: "gsheets",
      cellsOrRecords: 0,
      errors: ["Nessun aggiornamento: room type codes non trovati"],
    }
  }

  try {
    const result = await writer.writePrices(updates)
    return {
      success: result.success,
      method: "gsheets",
      cellsOrRecords: result.cellsUpdated,
      errors: result.errors,
    }
  } catch (err) {
    return {
      success: false,
      method: "gsheets",
      cellsOrRecords: 0,
      errors: [err instanceof Error ? err.message : "Errore sconosciuto GSheets"],
    }
  }
}
