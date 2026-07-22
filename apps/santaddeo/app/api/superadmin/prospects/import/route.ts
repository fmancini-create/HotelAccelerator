import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"
import * as XLSX from "xlsx"

export const maxDuration = 300 // 5 minuti per import grandi

// POST: Import Excel/CSV di prospects con dedup intelligente
// Query param: ?mode=preview (solo conteggio, no scrittura) | ?mode=execute (default)
export async function POST(request: NextRequest) {
  try {
    const guard = await requireSuperadmin()
    if ("error" in guard) return guard.error
    const user = guard.user
    
    const supabase = await createServiceRoleClient()
    
    const url = new URL(request.url)
    const mode = url.searchParams.get("mode") === "preview" ? "preview" : "execute"
    
    const formData = await request.formData()
    const file = formData.get("file") as File
    const dataSource = (formData.get("data_source") as string) || "manual_excel"
    const fallbackRegion = (formData.get("region") as string) || null
    const fallbackProvince = (formData.get("province") as string) || null
    
    if (!file) {
      return NextResponse.json({ error: "File non fornito" }, { status: 400 })
    }
    
    // === 1) PARSE FILE (Excel o CSV) ===
    const buffer = await file.arrayBuffer()
    const filename = file.name.toLowerCase()
    let rawRecords: Record<string, string>[] = []
    let detectedHeaders: string[] = []
    
    if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
      // Parse Excel: prendi il primo sheet
      const wb = XLSX.read(buffer, { type: "buffer", cellDates: false })
      const sheetName = wb.SheetNames[0]
      const sheet = wb.Sheets[sheetName]
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false })
      
      detectedHeaders = json.length > 0 ? Object.keys(json[0]) : []
      rawRecords = json.map(row => {
        const normalized: Record<string, string> = {}
        for (const [k, v] of Object.entries(row)) {
          normalized[k.toLowerCase().trim()] = v == null ? "" : String(v).trim()
        }
        return normalized
      })
    } else if (filename.endsWith(".csv")) {
      // Parse CSV
      const text = new TextDecoder("utf-8").decode(buffer)
      const decoded = text.includes("\uFFFD") ? new TextDecoder("iso-8859-1").decode(buffer) : text
      rawRecords = parseCSV(decoded)
      detectedHeaders = rawRecords.length > 0 ? Object.keys(rawRecords[0]) : []
    } else {
      return NextResponse.json({
        error: "Formato non supportato. Usa .xlsx, .xls o .csv",
      }, { status: 400 })
    }
    
    if (rawRecords.length === 0) {
      return NextResponse.json({ error: "File vuoto o senza dati" }, { status: 400 })
    }
    
    // === 2) AUTO-DETECT COLONNE ===
    const headers = Object.keys(rawRecords[0])
    const columnMap = {
      name: findColumn(headers, ["name", "nome", "ragione_sociale", "ragione sociale", "denominazione", "struttura", "nome struttura", "nome_struttura", "azienda", "name_for_emails"]),
      category: findColumn(headers, ["category", "categoria", "tipologia", "tipo", "tipologia struttura", "tipo struttura", "type", "subtypes"]),
      stars: findColumn(headers, ["stars", "stelle", "classificazione", "classifica", "categoria stelle"]),
      address: findColumn(headers, ["address", "indirizzo", "via", "ubicazione", "sede", "street", "full_address"]),
      city: findColumn(headers, ["city", "citta", "città", "comune", "località", "localita"]),
      province: findColumn(headers, ["province", "provincia", "prov", "sigla provincia", "state"]),
      region: findColumn(headers, ["region", "regione"]),
      postal_code: findColumn(headers, ["postal_code", "cap", "codice_postale", "codice postale"]),
      phone: findColumn(headers, ["phone_1", "phone", "telefono", "tel", "cellulare", "numero", "telefono fisso"]),
      email: findColumn(headers, ["email_1", "email", "mail", "pec", "e-mail", "posta elettronica"]),
      website: findColumn(headers, ["website", "sito", "url", "sito_web", "sito web", "web", "site"]),
      rooms_count: findColumn(headers, ["rooms_count", "camere", "num_camere", "n_camere", "numero camere", "totale camere"]),
      beds_count: findColumn(headers, ["beds_count", "posti_letto", "letti", "posti letto", "numero letti"]),
      // Colonne extra per fallback Outscraper-style
      query: findColumn(headers, ["query"]),
      email_2: findColumn(headers, ["email_2"]),
      email_3: findColumn(headers, ["email_3"]),
    }
    
    if (!columnMap.name) {
      return NextResponse.json({
        error: "Colonna 'nome' non trovata nel file. Colonne rilevate: " + detectedHeaders.join(", "),
        detected_headers: detectedHeaders,
      }, { status: 400 })
    }
    
    // === 3) NORMALIZZAZIONE + DEDUP INTRA-FILE ===
    type ParsedRow = {
      rowIdx: number
      data: Record<string, string | number | null>
      normalizedKey: string // normalized_name|city_lower per dedup
    }
    
    const parsed: ParsedRow[] = []
    const intraFileDuplicates: number[] = [] // indici delle righe duplicate nel file
    const seenKeys = new Set<string>()
    let invalid = 0
    
    for (let i = 0; i < rawRecords.length; i++) {
      const r = rawRecords[i]
      const name = columnMap.name ? r[columnMap.name]?.trim() : ""
      
      if (!name || name.length < 2) {
        invalid++
        continue
      }
      
      const cityRaw = columnMap.city ? r[columnMap.city]?.trim() : ""
      const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, "")
      const cityLower = (cityRaw || "").toLowerCase().trim()
      const key = `${normalizedName}|${cityLower}`
      
      if (seenKeys.has(key)) {
        intraFileDuplicates.push(i + 2) // +2 per riga Excel umana (header=1, 0-indexed)
        continue
      }
      seenKeys.add(key)
      
      // Categoria
      const catRaw = columnMap.category ? r[columnMap.category] : ""
      const category = normalizeCategory(catRaw)
      
      // Stelle
      let stars: number | null = null
      if (columnMap.stars) {
        const sv = r[columnMap.stars]?.trim()
        if (sv) {
          const parsedStars = parseInt(sv.replace(/[^0-9]/g, ""))
          if (parsedStars >= 1 && parsedStars <= 5) stars = parsedStars
        }
      }
      
      // Province: normalizza "Province of Siena" → "SI"
      const provRaw = columnMap.province ? r[columnMap.province] : ""
      const provCleaned = (provRaw || "").replace(/^province\s+of\s+/i, "").replace(/^provincia\s+di\s+/i, "").trim()
      const province = normalizeProvince(provCleaned) || (fallbackProvince ? normalizeProvince(fallbackProvince) : null)
      
      // Region: prova colonna esplicita, poi estrae da `query` Outscraper (es. "hotel, 53025, Triana, Toscana, IT")
      let region = columnMap.region ? r[columnMap.region]?.trim() : ""
      if (!region && columnMap.query) {
        const queryStr = r[columnMap.query] || ""
        // Pattern: "categoria, CAP, comune, Regione, IT" → estrae la penultima parte
        const parts = queryStr.split(",").map(s => s.trim()).filter(Boolean)
        if (parts.length >= 2) {
          const candidate = parts[parts.length - 2] // penultima
          if (candidate && candidate.length > 2 && candidate.toLowerCase() !== "it") {
            region = candidate
          }
        }
      }
      if (!region && fallbackRegion) region = fallbackRegion
      
      // Email: cascade email_1 → email_2 → email_3 (Outscraper)
      let emailValue = columnMap.email ? (r[columnMap.email] || "").trim().toLowerCase() : ""
      if (!emailValue && columnMap.email_2) emailValue = (r[columnMap.email_2] || "").trim().toLowerCase()
      if (!emailValue && columnMap.email_3) emailValue = (r[columnMap.email_3] || "").trim().toLowerCase()
      
      // Lat/lng (skip se UTM/Gauss-Boaga, range WGS84)
      let latitude: number | null = null
      let longitude: number | null = null
      const latCol = findColumn(headers, ["lat", "latitudine", "latitude"])
      const lngCol = findColumn(headers, ["lng", "lon", "longitude", "longitudine"])
      if (latCol) {
        const v = parseFloat((r[latCol] || "").replace(",", "."))
        if (!isNaN(v) && v >= -90 && v <= 90) latitude = v
      }
      if (lngCol) {
        const v = parseFloat((r[lngCol] || "").replace(",", "."))
        if (!isNaN(v) && v >= -180 && v <= 180) longitude = v
      }
      
      parsed.push({
        rowIdx: i + 2,
        normalizedKey: key,
        data: {
          name: name.substring(0, 255),
          category,
          stars,
          address: (columnMap.address ? r[columnMap.address]?.trim() : "").substring(0, 500) || null,
          city: cityRaw?.substring(0, 100) || null,
          province,
          region: region || null,
          postal_code: (columnMap.postal_code ? r[columnMap.postal_code]?.trim() : "").substring(0, 10) || null,
          country: "IT",
          phone: (columnMap.phone ? r[columnMap.phone]?.trim() : "").substring(0, 50) || null,
          email: emailValue.substring(0, 255) || null,
          website: (columnMap.website ? r[columnMap.website]?.trim() : "").substring(0, 500) || null,
          rooms_count: parseIntOrNull(columnMap.rooms_count ? r[columnMap.rooms_count] : ""),
          beds_count: parseIntOrNull(columnMap.beds_count ? r[columnMap.beds_count] : ""),
          latitude,
          longitude,
          data_source: dataSource,
          status: "unassigned",
        },
      })
    }
    
    // === 4) DEDUP CONTRO IL DB ===
    // Pre-fetch dei record esistenti che matchano normalized_name in chunk da 500
    const dbExistingByKey = new Map<string, Record<string, unknown>>()
    const normalizedNamesToCheck = parsed.map(p => p.normalizedKey.split("|")[0])
    const uniqueNormalizedNames = Array.from(new Set(normalizedNamesToCheck))
    
    const chunkSize = 500
    for (let i = 0; i < uniqueNormalizedNames.length; i += chunkSize) {
      const chunk = uniqueNormalizedNames.slice(i, i + chunkSize)
      const { data: existing, error: fetchErr } = await supabase
        .from("prospects")
        .select("id, name, normalized_name, city, address, phone, email, website, rooms_count, beds_count, stars, category, latitude, longitude, postal_code, region, province")
        .in("normalized_name", chunk)
      
      if (fetchErr) {
        console.error("[v0] Error fetching existing prospects:", fetchErr)
        continue
      }
      
      for (const e of existing || []) {
        const cityLower = ((e.city as string) || "").toLowerCase().trim()
        const key = `${e.normalized_name}|${cityLower}`
        dbExistingByKey.set(key, e as Record<string, unknown>)
      }
    }
    
    // === 5) CLASSIFICA: nuovi vs esistenti vs aggiornabili ===
    type Classified = {
      action: "insert" | "update_merge" | "skip_no_change"
      data: Record<string, string | number | null>
      existingId?: string
      mergedFields?: string[] // campi che verrebbero aggiunti tramite update
    }
    
    const classified: Classified[] = []
    let toInsertCount = 0
    let toUpdateCount = 0
    let alreadyCompleteCount = 0
    
    // Campi che possiamo arricchire (NULL → valore presente nel file)
    const enrichableFields = ["address", "phone", "email", "website", "rooms_count", "beds_count", "stars", "latitude", "longitude", "postal_code", "region", "province"]
    
    for (const p of parsed) {
      const existing = dbExistingByKey.get(p.normalizedKey)
      
      if (!existing) {
        classified.push({ action: "insert", data: p.data })
        toInsertCount++
      } else {
        // Esiste già: vedo se ci sono campi da arricchire
        const updateData: Record<string, string | number | null> = {}
        const mergedFields: string[] = []
        
        for (const field of enrichableFields) {
          const existingValue = existing[field]
          const newValue = p.data[field]
          
          // Update solo se DB ha NULL/vuoto e file ha un valore
          if ((existingValue === null || existingValue === "" || existingValue === undefined) && 
              newValue !== null && newValue !== "" && newValue !== undefined) {
            updateData[field] = newValue
            mergedFields.push(field)
          }
        }
        
        if (mergedFields.length > 0) {
          classified.push({
            action: "update_merge",
            data: updateData,
            existingId: existing.id as string,
            mergedFields,
          })
          toUpdateCount++
        } else {
          classified.push({ action: "skip_no_change", data: {}, existingId: existing.id as string })
          alreadyCompleteCount++
        }
      }
    }
    
    // === 6) PREVIEW MODE: ritorna solo statistiche ===
    if (mode === "preview") {
      const sampleNew = classified.filter(c => c.action === "insert").slice(0, 5).map(c => ({
        name: c.data.name as string,
        city: c.data.city as string,
        province: c.data.province as string,
      }))
      const sampleUpdates = classified.filter(c => c.action === "update_merge").slice(0, 5).map(c => ({
        existingId: c.existingId,
        merged: c.mergedFields,
      }))
      
      return NextResponse.json({
        mode: "preview",
        stats: {
          total_rows: rawRecords.length,
          parsed: parsed.length,
          invalid_rows: invalid,
          intra_file_duplicates: intraFileDuplicates.length,
          to_insert: toInsertCount,
          to_update: toUpdateCount,
          already_complete: alreadyCompleteCount,
        },
        column_mapping: columnMap,
        detected_headers: detectedHeaders,
        sample_new: sampleNew,
        sample_updates: sampleUpdates,
      })
    }
    
    // === 7) EXECUTE: insert + update ===
    // Crea record import
    const { data: importRecord } = await supabase
      .from("prospect_imports")
      .insert({
        filename: file.name,
        data_source: dataSource,
        total_rows: rawRecords.length,
        imported_rows: 0,
        skipped_rows: 0,
        error_rows: 0,
        errors: [],
        imported_by: user.id,
      })
      .select()
      .single()
    
    let inserted = 0
    let updated = 0
    const errors: { context: string; error: string }[] = []
    
    // INSERT in batch da 500
    const toInsert = classified.filter(c => c.action === "insert").map(c => c.data)
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const chunk = toInsert.slice(i, i + chunkSize)
      const { data, error } = await supabase
        .from("prospects")
        .insert(chunk)
        .select("id")
      
      if (error) {
        console.error("[v0] Insert chunk error:", error)
        errors.push({ context: `insert chunk ${i}`, error: error.message })
      } else {
        inserted += data?.length || 0
      }
    }
    
    // UPDATE merge: uno per volta (campi diversi per ogni riga)
    const toUpdate = classified.filter(c => c.action === "update_merge")
    for (const u of toUpdate) {
      if (!u.existingId) continue
      const { error } = await supabase
        .from("prospects")
        .update({ ...u.data, last_enriched_at: new Date().toISOString() })
        .eq("id", u.existingId)
      
      if (error) {
        errors.push({ context: `update ${u.existingId}`, error: error.message })
      } else {
        updated++
      }
    }
    
    // Aggiorna record import
    if (importRecord) {
      await supabase
        .from("prospect_imports")
        .update({
          imported_rows: inserted,
          skipped_rows: alreadyCompleteCount + intraFileDuplicates.length + invalid,
          error_rows: errors.length,
          errors: errors.slice(0, 100),
          completed_at: new Date().toISOString(),
        })
        .eq("id", importRecord.id)
    }
    
    return NextResponse.json({
      success: true,
      mode: "execute",
      import_id: importRecord?.id,
      stats: {
        total_rows: rawRecords.length,
        inserted,
        updated,
        already_complete: alreadyCompleteCount,
        intra_file_duplicates: intraFileDuplicates.length,
        invalid_rows: invalid,
        errors: errors.length,
      },
      sample_errors: errors.slice(0, 10),
    })
  } catch (error) {
    console.error("[v0] Error in prospects import POST:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore interno del server" },
      { status: 500 }
    )
  }
}

// =====================
// HELPERS
// =====================

// Parse CSV con auto-detect separatore (`,` o `;`) e gestione virgolette
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  
  // Auto-detect separatore: confronta count di `;` vs `,` nella prima riga
  const firstLine = lines[0]
  const semicolons = (firstLine.match(/;/g) || []).length
  const commas = (firstLine.match(/,/g) || []).length
  const sep = semicolons > commas ? ";" : ","
  
  const parseLine = (line: string): string[] => {
    const out: string[] = []
    let cur = ""
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (c === sep && !inQuotes) {
        out.push(cur.trim())
        cur = ""
      } else {
        cur += c
      }
    }
    out.push(cur.trim())
    return out
  }
  
  const headers = parseLine(lines[0]).map(h => h.toLowerCase().trim())
  const records: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i])
    const r: Record<string, string> = {}
    headers.forEach((h, idx) => { r[h] = values[idx] || "" })
    records.push(r)
  }
  return records
}

// Trova chiave colonna in un oggetto record (case-insensitive con varianti)
function findColumn(headers: string[], variants: string[]): string | null {
  const normalized = headers.map(h => h.toLowerCase().trim())
  
  // 1) Match esatto
  for (const v of variants) {
    const idx = normalized.indexOf(v.toLowerCase())
    if (idx !== -1) return headers[idx]
  }
  // 2) Match contenuto
  for (const v of variants) {
    const idx = normalized.findIndex(h => h.includes(v.toLowerCase()) || v.toLowerCase().includes(h))
    if (idx !== -1) return headers[idx]
  }
  return null
}

function parseIntOrNull(v: string | undefined): number | null {
  if (!v) return null
  const n = parseInt(String(v).replace(/[^0-9]/g, ""))
  return isNaN(n) || n === 0 ? null : n
}

function normalizeCategory(cat: string | undefined): string {
  if (!cat) return "altro"
  const n = cat.toLowerCase()
    .replace(/[àáâãäå]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u")
  if (n.includes("hotel") || n.includes("albergo")) return "hotel"
  if (n.includes("b&b") || n.includes("bed") || n.includes("breakfast") || n.includes("affittacamer")) return "b&b"
  if (n.includes("agriturismo") || n.includes("agri")) return "agriturismo"
  if (n.includes("residence")) return "residence"
  if (n.includes("camping") || n.includes("campeggio")) return "camping"
  if (n.includes("ostello") || n.includes("hostel")) return "ostello"
  if (n.includes("casa") || n.includes("appartament") || n.includes("vacation") || n.includes("vacanze")) return "casa_vacanze"
  if (n.includes("villaggio")) return "villaggio_turistico"
  return "altro"
}

const PROVINCE_MAP: Record<string, string> = {
  "AGRIGENTO": "AG", "ALESSANDRIA": "AL", "ANCONA": "AN", "AOSTA": "AO", "AREZZO": "AR",
  "ASCOLI PICENO": "AP", "ASTI": "AT", "AVELLINO": "AV", "BARI": "BA", "BARLETTA": "BT",
  "BELLUNO": "BL", "BENEVENTO": "BN", "BERGAMO": "BG", "BIELLA": "BI", "BOLOGNA": "BO",
  "BOLZANO": "BZ", "BRESCIA": "BS", "BRINDISI": "BR", "CAGLIARI": "CA", "CALTANISSETTA": "CL",
  "CAMPOBASSO": "CB", "CARBONIA": "SU", "CASERTA": "CE", "CATANIA": "CT", "CATANZARO": "CZ",
  "CHIETI": "CH", "COMO": "CO", "COSENZA": "CS", "CREMONA": "CR", "CROTONE": "KR",
  "CUNEO": "CN", "ENNA": "EN", "FERMO": "FM", "FERRARA": "FE", "FIRENZE": "FI",
  "FOGGIA": "FG", "FORLI": "FC", "FORLÌ-CESENA": "FC", "FROSINONE": "FR", "GENOVA": "GE",
  "GORIZIA": "GO", "GROSSETO": "GR", "IMPERIA": "IM", "ISERNIA": "IS", "L'AQUILA": "AQ",
  "LAQUILA": "AQ", "LA SPEZIA": "SP", "LATINA": "LT", "LECCE": "LE", "LECCO": "LC",
  "LIVORNO": "LI", "LODI": "LO", "LUCCA": "LU", "MACERATA": "MC", "MANTOVA": "MN",
  "MASSA": "MS", "MASSA-CARRARA": "MS", "MATERA": "MT", "MESSINA": "ME", "MILANO": "MI",
  "MODENA": "MO", "MONZA": "MB", "MONZA E BRIANZA": "MB", "NAPOLI": "NA", "NOVARA": "NO",
  "NUORO": "NU", "ORISTANO": "OR", "PADOVA": "PD", "PALERMO": "PA", "PARMA": "PR",
  "PAVIA": "PV", "PERUGIA": "PG", "PESARO": "PU", "PESCARA": "PE", "PIACENZA": "PC",
  "PISA": "PI", "PISTOIA": "PT", "PORDENONE": "PN", "POTENZA": "PZ", "PRATO": "PO",
  "RAGUSA": "RG", "RAVENNA": "RA", "REGGIO CALABRIA": "RC", "REGGIO EMILIA": "RE",
  "RIETI": "RI", "RIMINI": "RN", "ROMA": "RM", "ROVIGO": "RO", "SALERNO": "SA",
  "SASSARI": "SS", "SAVONA": "SV", "SIENA": "SI", "SIRACUSA": "SR", "SONDRIO": "SO",
  "TARANTO": "TA", "TERAMO": "TE", "TERNI": "TR", "TORINO": "TO", "TRAPANI": "TP",
  "TRENTO": "TN", "TREVISO": "TV", "TRIESTE": "TS", "UDINE": "UD", "VARESE": "VA",
  "VENEZIA": "VE", "VERBANIA": "VB", "VERCELLI": "VC", "VERONA": "VR", "VIBO VALENTIA": "VV",
  "VICENZA": "VI", "VITERBO": "VT",
}

function normalizeProvince(prov: string | undefined): string | null {
  if (!prov) return null
  const cleaned = prov.trim().toUpperCase()
  if (cleaned.length === 2) return cleaned
  return PROVINCE_MAP[cleaned] || null
}
