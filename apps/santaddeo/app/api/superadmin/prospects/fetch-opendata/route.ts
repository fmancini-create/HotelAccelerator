import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Fonti OpenData verificate funzionanti (10/05/2026)
type Source = {
  name: string
  url: string
  region: string
  province: string | null
  format?: "csv" | "xml" | "trentino_xml" | "bologna_api" | "toscana_zip"
  // Campo da usare come identificatore univoco per source_id (es. "n_pratica", "id_esercizio")
  // Se non specificato, usa fallback "name+city" che può collidere
  idField?: string
  // Field mapping per CSV con header non standard
  fields?: {
    name?: string[]
    category?: string[]
    stars?: string[]
    address?: string[]
    city?: string[]
    province?: string[]
    cap?: string[]
    phone?: string[]
    email?: string[]
    website?: string[]
    rooms?: string[]
    beds?: string[]
    lat?: string[]
    lng?: string[]
  }
}

const OPENDATA_SOURCES: Source[] = [
  // === PUGLIA === (~10.000 strutture, 2021)
  {
    name: "Puglia - Strutture Ricettive 2021",
    url: "https://dati.puglia.it/ckan/dataset/elenco-strutture-ricettive/resource/72f7cc63-0bf9-4bc6-9f49-d24e0fe7b1bb/download/elenco-delle-strutture-ricettive-2021.csv",
    region: "Puglia",
    province: null,
    fields: {
      name: ["denominazione"],
      category: ["tipologia"],
      stars: ["categoria"],
      address: ["indirizzo"],
      city: ["comune"],
      province: ["provincia"],
      cap: ["cap"],
      phone: ["telefono"],
      email: ["email"],
      website: ["sitoweb"],
      rooms: ["totale_unita"],
      beds: ["totale_letti"],
      lat: ["latitudine"],
      lng: ["longitudine"],
    },
  },
  // === UMBRIA === (~2.000 strutture, aggiornato quotidianamente)
  {
    name: "Umbria - Strutture Ricettive",
    url: "https://dati.regione.umbria.it/datastore/dump/062d7bd6-f9c6-424e-9003-0b7cb3744cab",
    region: "Umbria",
    province: null,
    fields: {
      name: ["denominazione"],
      category: ["tipologia"],
      stars: ["categoria"],
      address: ["indirizzo"],
      city: ["comune"],
      province: ["prov"],
      cap: ["cap"],
      phone: ["telefono"],
      email: ["email"],
      website: ["web"],
      rooms: ["totale_unita"],
      beds: ["totale_letti"],
      lat: ["coordy"],
      lng: ["coordx"],
    },
  },
  // === BASILICATA - MATERA === (Google Sheets pubblico)
  {
    name: "Matera - Strutture Ricettive",
    url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTj3s9jj7shHskVEx4uox9IDn0TQomgYiZ8whfZbvOpvLqWkxrxVV17OCsoJrqmvfWSrG1n5GCZT1Qn/pub?gid=26988434&single=true&output=csv",
    region: "Basilicata",
    province: "Matera",
    fields: {
      name: ["denominazione", "nome", "ragione_sociale"],
      category: ["tipologia", "categoria"],
      address: ["indirizzo"],
      city: ["comune", "citta"],
      cap: ["cap"],
      phone: ["telefono"],
      email: ["email"],
      website: ["sito", "web"],
    },
  },
  // === TRENTINO === (XML con esercizi alberghieri - parser custom per <prezzi-albergo>)
  {
    name: "Trentino - Esercizi Alberghieri",
    url: "https://www.stu.provincia.tn.it/downloadOpenData.do?nomeFile=EserciziAlberghieri.xml",
    region: "Trentino-Alto Adige",
    province: "Trento",
    format: "trentino_xml",
    idField: "id_esercizio",
  },
  // === TRENTINO EXTRA === (B&B, agriturismi, case vacanze)
  {
    name: "Trentino - Esercizi Extra-Alberghieri",
    url: "https://www.stu.provincia.tn.it/downloadOpenData.do?nomeFile=EserciziExtraAlberghieri.xml",
    region: "Trentino-Alto Adige",
    province: "Trento",
    format: "trentino_xml",
    idField: "id_esercizio",
  },
  // === EMILIA-ROMAGNA - BOLOGNA === (CSV export completo, 19.553 pratiche)
  {
    name: "Bologna - Attività Ricettive",
    url: "https://opendata.comune.bologna.it/api/explore/v2.1/catalog/datasets/istanze-attivita-ricettive/exports/csv",
    region: "Emilia-Romagna",
    province: "Bologna",
    format: "bologna_api",
    idField: "n_pratica",
  },
  // === EMILIA-ROMAGNA - MODENA === (strutture VisitModena via WFS GeoServer)
  {
    name: "Modena - Strutture Ricettive (VisitModena)",
    url: "https://geonext.comune.modena.it/geoservernext//Modena/VISIT_STRUTTURE_RIC_preview/wfs?service=WFS&version=1.3.0&request=GetFeature&typename=Modena:VISIT_STRUTTURE_RIC_preview&outputformat=csv",
    region: "Emilia-Romagna",
    province: "Modena",
    idField: "fid", // FID identificativo unico WFS (objectid spesso ripetuto)
    fields: {
      name: ["nome"],
      category: ["tipo_struttura"],
      stars: ["tipo_struttura"],
      address: ["indirizzo"],
      city: ["comune"],
      phone: ["phone"],
      email: ["email"],
      website: ["sito_struttura"],
      lat: ["latitudine"],
      lng: ["longitudine"],
    },
  },
  // === LAZIO - ROMA === (~30.000 strutture SUAR Roma Capitale, giugno 2025)
  {
    name: "Roma - Strutture Ricettive (SUAR)",
    url: "https://dati.comune.roma.it/catalog/dataset/c71fb0bc-109d-4f36-81c0-287ec9bda520/resource/9a1c0c01-0953-4436-89a8-ac286d58dc5c/download/suar2025-06.csv",
    region: "Lazio",
    province: "Roma",
    idField: "id",
    fields: {
      name: ["denominazione"],
      category: ["tipologia"],
      stars: ["stelle"],
      address: ["via"], // viene combinato con civico in extraField
      cap: ["cap"],
      phone: ["contattotelefono", "contattocellulare"],
      email: ["contattoemail"],
      website: ["contattowebsite"],
      rooms: ["totalenumerocamere"],
      beds: ["totalepostiletto"],
      lat: ["latitude"],
      lng: ["longitude"],
    },
  },
  // === LOMBARDIA - MILANO === (~19.000 strutture comune di Milano)
  {
    name: "Milano - Strutture Ricettive",
    url: "https://www.dati.lombardia.it/api/views/ee8u-8wwr/rows.csv?accessType=DOWNLOAD",
    region: "Lombardia",
    province: "Milano",
    idField: "id_struttura",
    fields: {
      name: ["denominazione_struttura"],
      category: ["categoria"],
      stars: ["classificazione"],
      address: ["indirizzo"],
      city: ["nome_comune"],
      province: ["provincia"],
      cap: ["cap"],
      phone: ["tel"],
      email: ["email"],
      website: ["web"],
      rooms: ["camere"],
      beds: ["letti"],
      lat: ["geo_y"],
      lng: ["geo_x"],
    },
  },
  // === LOMBARDIA - CREMONA === (alberghieri ed extra-alberghieri)
  {
    name: "Cremona - Strutture Ricettive",
    url: "https://www.dati.lombardia.it/api/views/hzzb-mpuc/rows.csv?accessType=DOWNLOAD",
    region: "Lombardia",
    province: "Cremona",
    idField: "id_struttura",
    fields: {
      name: ["denominazione_struttura"],
      category: ["categoria"],
      stars: ["classificazione"],
      address: ["indirizzo"],
      city: ["nome_comune"],
      province: ["provincia"],
      cap: ["cap"],
      phone: ["tel"],
      email: ["email"],
      website: ["web"],
      rooms: ["camere"],
      beds: ["letti"],
      lat: ["geo_y"],
      lng: ["geo_x"],
    },
  },
  // === TOSCANA - PISA === (~1.241 strutture provincia di Pisa, ZIP con CSV all'interno)
  {
    name: "Toscana - Pisa (Provincia)",
    url: "https://maps.provincia.pisa.it/metarepo2/api/datasets/strutture_ricettive/resources/100/DATA",
    region: "Toscana",
    province: "Pisa",
    format: "toscana_zip",
    fields: {
      name: ["nome struttura"],
      category: ["tipologia"],
      stars: ["classificazione"],
      address: ["via"],
      city: ["comune"],
      cap: ["cap"],
      phone: ["telefono"],
      website: ["sito web"],
    },
  },
  // === LOMBARDIA - MONZA BRIANZA === (~500 strutture)
  {
    name: "Monza Brianza - Strutture Ricettive",
    url: "https://www.dati.lombardia.it/api/views/84ke-zwng/rows.csv?accessType=DOWNLOAD",
    region: "Lombardia",
    province: "Monza Brianza",
    idField: "id",
    fields: {
      name: ["nome"],
      category: ["categoria"],
      stars: ["classifica"],
      address: ["indirizzo"],
      city: ["comune"],
      province: ["provincia"],
      cap: ["cap"],
      phone: ["tel"],
      email: ["email"],
      website: ["web"],
    },
  },
]

const CATEGORY_MAP: Record<string, string> = {
  "albergo": "hotel", "hotel": "hotel", "motel": "hotel",
  "residence": "residence", "residenza": "residence", "rta": "residence",
  "b&b": "bb", "bed and breakfast": "bb", "bed & breakfast": "bb", "bed&breakfast": "bb",
  "affittacamere": "affittacamere",
  "agriturismo": "agriturismo",
  "campeggio": "camping", "camping": "camping",
  "villaggio": "villaggio",
  "ostello": "ostello",
  "rifugio": "rifugio",
  "casa vacanze": "casa_vacanze", "casa vacanza": "casa_vacanze", "case vacanze": "casa_vacanze",
  "appartamento": "appartamento", "appartamenti": "appartamento",
  "locazione turistica": "locazione", "locazione": "locazione",
  "albergo diffuso": "hotel",
  "country house": "agriturismo",
}

function normalizeCategory(raw: string): string {
  if (!raw) return "altro"
  const lower = raw.toLowerCase().trim()
  for (const [key, value] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) return value
  }
  return "altro"
}

function normalizeStars(raw: string | number | null): number | null {
  if (raw === null || raw === undefined || raw === "") return null
  const str = String(raw).trim()
  const match = str.match(/(\d)/)
  if (match) {
    const num = parseInt(match[1], 10)
    if (num >= 1 && num <= 5) return num
  }
  return null
}

// Parser CSV RFC 4180 robusto: gestisce virgolette, virgole/punto-e-virgola dentro quotes, escape
function parseCSV(content: string): Record<string, string>[] {
  // Rimuovi BOM se presente
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1)
  }
  
  // Rileva separatore dalla prima riga (solo fuori dalle virgolette)
  let firstLineEnd = content.indexOf("\n")
  if (firstLineEnd === -1) firstLineEnd = content.length
  const firstLine = content.slice(0, firstLineEnd)
  
  // Conta separatori candidati fuori dalle virgolette
  const counts = { ",": 0, ";": 0, "\t": 0 }
  let inQuotes = false
  for (let i = 0; i < firstLine.length; i++) {
    const c = firstLine[i]
    if (c === '"') inQuotes = !inQuotes
    else if (!inQuotes && c in counts) counts[c as keyof typeof counts]++
  }
  let separator = ","
  if (counts[";"] > counts[","]) separator = ";"
  if (counts["\t"] > counts[separator as keyof typeof counts]) separator = "\t"
  
  // Parsing carattere per carattere (RFC 4180)
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ""
  inQuotes = false
  
  for (let i = 0; i < content.length; i++) {
    const c = content[i]
    const next = content[i + 1]
    
    if (inQuotes) {
      if (c === '"' && next === '"') {
        // Quote escapata: ""
        currentField += '"'
        i++
      } else if (c === '"') {
        inQuotes = false
      } else {
        currentField += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === separator) {
        currentRow.push(currentField)
        currentField = ""
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && next === "\n") i++
        currentRow.push(currentField)
        if (currentRow.some(f => f.trim())) rows.push(currentRow)
        currentRow = []
        currentField = ""
      } else {
        currentField += c
      }
    }
  }
  // Ultima riga senza newline
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField)
    if (currentRow.some(f => f.trim())) rows.push(currentRow)
  }
  
  if (rows.length < 2) return []
  
  const headers = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, "_"))
  
  return rows.slice(1).map(values => {
    const record: Record<string, string> = {}
    headers.forEach((h, i) => {
      record[h] = (values[i] || "").trim()
    })
    return record
  })
}

// Parser XML semplice per Trentino (estrae elementi <esercizio>...</esercizio>)
function parseXML(content: string): Record<string, string>[] {
  const records: Record<string, string>[] = []
  
  // Trova tutti gli elementi che si ripetono al primo livello sotto root
  // Pattern flessibile: <NomeElemento>...</NomeElemento>
  const itemPattern = /<(esercizio|struttura|hotel|albergo|item|record|row)\b[^>]*>([\s\S]*?)<\/\1>/gi
  const matches = content.matchAll(itemPattern)
  
  for (const match of matches) {
    const itemXml = match[2]
    const record: Record<string, string> = {}
    
    // Estrai tutti i tag figli: <campo>valore</campo>
    const fieldPattern = /<([a-zA-Z_][a-zA-Z0-9_]*)\b[^>]*>([\s\S]*?)<\/\1>/g
    const fieldMatches = itemXml.matchAll(fieldPattern)
    
    for (const fm of fieldMatches) {
      const tag = fm[1].toLowerCase()
      let value = fm[2].trim()
      // Decode HTML entities basic
      value = value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      // Skip CDATA wrapper
      const cdataMatch = value.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/)
      if (cdataMatch) value = cdataMatch[1]
      record[tag] = value
    }
    
    if (Object.keys(record).length > 0) records.push(record)
  }
  
  return records
}

// Parser XML specifico per Trentino - gestisce sia Alberghieri che Extra-Alberghieri
// Alberghieri: <prezzi-localita-turistica> > <prezzi-albergo> > <prezzi-saa denominazione=... />
// Extra:       <prezzi-localita-turistica> > <prezzi-localita> > <tipo-extraalbergo> > <prezzi-extraalbergo> > <prezzi-eea denominazione=... />
function parseTrentinoXML(content: string): Record<string, string>[] {
  const records: Record<string, string>[] = []
  
  // Helper per estrarre attributi da un tag XML
  const extractAttrs = (tagXml: string): Record<string, string> => {
    const attrs: Record<string, string> = {}
    const attrPattern = /([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*"([^"]*)"/g
    for (const m of tagXml.matchAll(attrPattern)) {
      attrs[m[1].toLowerCase().replace(/-/g, "_")] = m[2].trim()
    }
    return attrs
  }
  
  // Itera sulle località turistiche per ottenere il contesto
  const localitaTuristicaPattern = /<prezzi-localita-turistica\b([^>]*)>([\s\S]*?)<\/prezzi-localita-turistica>/gi
  
  for (const ltMatch of content.matchAll(localitaTuristicaPattern)) {
    const ltAttrs = extractAttrs(ltMatch[1])
    const ltContent = ltMatch[2]
    const denomEnte = ltAttrs.denominazione_ente_annuario_localita_turistica || ltAttrs.denominazione_localita_turistica || ""
    const capLT = ltAttrs.cap_localita_turistica || ""
    
    // === FORMATO 1: Alberghieri (<prezzi-albergo> > <prezzi-saa />) ===
    const albergoPattern = /<prezzi-albergo\b([^>]*)>([\s\S]*?)<\/prezzi-albergo>/gi
    for (const albergoMatch of ltContent.matchAll(albergoPattern)) {
      const albergoAttrs = extractAttrs(albergoMatch[1])
      const saaMatch = albergoMatch[2].match(/<prezzi-saa\b([^>]*?)\/?>/i)
      if (!saaMatch) continue
      const saaAttrs = extractAttrs(saaMatch[1])
      
      if (saaAttrs.denominazione && saaAttrs.denominazione.length > 1) {
        records.push({
          denominazione: saaAttrs.denominazione,
          comune: saaAttrs.comune || denomEnte,
          indirizzo: saaAttrs.indirizzo || "",
          frazione: saaAttrs.frazione || "",
          livello_classifica: saaAttrs.livello_classifica || "",
          tipologia: albergoAttrs.tipologia_alberghiera || "Albergo",
          numero_unita: albergoAttrs.numero_unita || "",
          numero_posti_letto: albergoAttrs.numero_posti_letto || "",
          telefono: albergoAttrs.recapito_telefono || "",
          email: albergoAttrs.recapito_email || "",
          sito: albergoAttrs.recapito_www || "",
          cap: capLT,
          p_iva: albergoAttrs.p_iva || saaAttrs.p_iva || "",
          id_esercizio: albergoAttrs.id_eserciziosaa || saaAttrs.id_eserciziosaa || "",
        })
      }
    }
    
    // === FORMATO 2: Extra-Alberghieri (<prezzi-localita> > <tipo-extraalbergo> > <prezzi-extraalbergo> > <prezzi-eea />) ===
    const localitaPattern = /<prezzi-localita\b([^>]*)>([\s\S]*?)<\/prezzi-localita>/gi
    for (const locMatch of ltContent.matchAll(localitaPattern)) {
      const locAttrs = extractAttrs(locMatch[1])
      const locContent = locMatch[2]
      const capLocalita = locAttrs.cap_localita || capLT
      
      // <tipo-extraalbergo>
      const tipoExtraPattern = /<tipo-extraalbergo\b([^>]*)>([\s\S]*?)<\/tipo-extraalbergo>/gi
      for (const tipoMatch of locContent.matchAll(tipoExtraPattern)) {
        const tipoExtraAttrs = extractAttrs(tipoMatch[1])
        const tipoContent = tipoMatch[2]
        
        // <prezzi-extraalbergo> con suo contenuto
        const extraPattern = /<prezzi-extraalbergo\b([^>]*)>([\s\S]*?)<\/prezzi-extraalbergo>/gi
        for (const extraMatch of tipoContent.matchAll(extraPattern)) {
          const extraAttrs = extractAttrs(extraMatch[1])
          // <prezzi-eea> contiene i dati strutturali
          const eeaMatch = extraMatch[2].match(/<prezzi-eea\b([^>]*?)>/i)
          if (!eeaMatch) continue
          const eeaAttrs = extractAttrs(eeaMatch[1])
          
          if (eeaAttrs.denominazione && eeaAttrs.denominazione.length > 1) {
            records.push({
              denominazione: eeaAttrs.denominazione,
              comune: eeaAttrs.comune || denomEnte,
              indirizzo: eeaAttrs.indirizzo || "",
              frazione: eeaAttrs.frazione || "",
              livello_classifica: eeaAttrs.livello_classifica || "",
              tipologia: extraAttrs.tipologia_extraalberghiera || tipoExtraAttrs.tipologia_extraalberghiera || "Extra-alberghiero",
              numero_unita: eeaAttrs.numero_camere || "",
              numero_posti_letto: eeaAttrs.numero_posti_letto || "",
              telefono: extraAttrs.recapito_telefono || "",
              email: extraAttrs.recapito_email || "",
              sito: extraAttrs.recapito_www || "",
              cap: capLocalita,
              p_iva: eeaAttrs.p_iva || "",
              id_esercizio: eeaAttrs.id_esercizioricettivo || "",
            })
          }
        }
      }
    }
  }
  
  return records
}

// Fetcher per Bologna: usa l'endpoint CSV export (no limit 10k come l'API JSON paginata)
// Endpoint: /api/explore/v2.1/catalog/datasets/<dataset>/exports/csv → restituisce TUTTI i record
async function fetchBolognaApi(baseUrl: string): Promise<Record<string, string>[]> {
  // Trasforma l'URL "records" in "exports/csv"
  const csvExportUrl = baseUrl.replace(/\/records\/?$/, "/exports/csv") +
    (baseUrl.includes("/exports/csv") ? "" : "")
  
  const response = await fetch(csvExportUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Santaddeo-CRM/1.0)",
      "Accept": "text/csv,*/*",
    },
    signal: AbortSignal.timeout(60000), // 60s per export completo (~20k records)
  })
  if (!response.ok) {
    throw new Error(`Bologna export HTTP ${response.status}`)
  }
  
  const csvText = await response.text()
  const csvRecords = parseCSV(csvText)
  
  // Mappa al formato uniforme: Bologna usa header come esercizio_via, esercizio_civico, ecc.
  return csvRecords.map(r => {
    const tipo = r.tipo_intervento || ""
    const via = r.esercizio_via || ""
    const civico = r.esercizio_civico || ""
    const localita = r.esercizio_localita || ""
    
    // Estrai denominazione sintetica dal tipo intervento
    const tipoMatch = tipo.match(/(?:di|della|attività di)\s+([^-,]+?)(?:\s*-|\s*$)/i)
    const denomFromTipo = tipoMatch ? tipoMatch[1].trim() : (r.sottoarea || "Struttura ricettiva")
    
    return {
      denominazione: `${denomFromTipo} - ${via} ${civico}`.trim(),
      tipologia: r.sottoarea || "",
      indirizzo: `${via} ${civico}`.trim(),
      comune: "Bologna",
      provincia: "BO",
      localita: localita,
      n_pratica: r.n_e_anno_prot_domanda || "",
      data_richiesta: r.data_richiesta || "",
      lat: r.latitudine || "",
      lng: r.longitudine || "",
    }
  })
}

// Fetcher per Toscana - Pisa: scarica ZIP, estrae il CSV all'interno (separatore virgola, encoding Latin-1)
async function fetchToscanaZip(url: string): Promise<Record<string, string>[]> {
  const JSZip = (await import("jszip")).default
  
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Santaddeo-CRM/1.0)",
      "Accept": "application/zip,*/*",
    },
    signal: AbortSignal.timeout(60000),
  })
  if (!response.ok) {
    throw new Error(`Toscana ZIP HTTP ${response.status}`)
  }
  
  const zipBuffer = await response.arrayBuffer()
  const zip = await JSZip.loadAsync(zipBuffer)
  
  // Cerca il file CSV all'interno della cartella RISORSE/
  let csvFile: typeof zip.files[string] | null = null
  zip.forEach((path, file) => {
    if (path.toLowerCase().endsWith(".csv") && !file.dir) {
      csvFile = file
    }
  })
  
  if (!csvFile) {
    throw new Error("Toscana ZIP: nessun file CSV trovato")
  }
  
  // Estrai come Uint8Array per gestire encoding Latin-1
  const csvBytes = await (csvFile as typeof zip.files[string]).async("uint8array")
  let csvText = new TextDecoder("utf-8").decode(csvBytes)
  if (csvText.includes("\uFFFD")) {
    csvText = new TextDecoder("iso-8859-1").decode(csvBytes)
  }
  
  return parseCSV(csvText)
}

function getField(record: Record<string, string>, candidateKeys: string[] | undefined, fallbacks: string[] = []): string {
  const keys = [...(candidateKeys || []), ...fallbacks]
  for (const key of keys) {
    const k = key.toLowerCase()
    const val = record[k]
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      return String(val).trim()
    }
  }
  return ""
}

function parseIntOrNull(v: string): number | null {
  if (!v) return null
  const n = parseInt(v.replace(/[^\d-]/g, ""), 10)
  return isNaN(n) ? null : n
}

function parseFloatOrNull(v: string): number | null {
  if (!v) return null
  const n = parseFloat(v.replace(",", "."))
  return isNaN(n) ? null : n
  }
  
  // Parser lat/lng con validazione range GPS WGS84.
  // Skippa silenziosamente coordinate UTM/Gauss-Boaga (es. 5038006, 516505) che farebbero overflow numeric(10,7).
  function parseLatitude(v: string): number | null {
  const n = parseFloatOrNull(v)
  if (n === null) return null
  if (n < -90 || n > 90) return null // Range valido WGS84 latitudine
  return n
  }
  function parseLongitude(v: string): number | null {
  const n = parseFloatOrNull(v)
  if (n === null) return null
  if (n < -180 || n > 180) return null // Range valido WGS84 longitudine
  return n
  }

export async function POST(request: NextRequest) {
  try {
    const guard = await requireSuperadmin()
    if ("error" in guard) return guard.error

    const supabase = await createServiceRoleClient()
    const body = await request.json().catch(() => ({}))
    const selectedSources: number[] = body.sources || OPENDATA_SOURCES.map((_, i) => i)

    const results: { source: string; imported: number; parsed?: number; error?: string }[] = []

    for (const idx of selectedSources) {
      const source = OPENDATA_SOURCES[idx]
      if (!source) continue

      try {
        let records: Record<string, string>[] = []
        
        // Parser API custom Bologna (paginazione)
        if (source.format === "bologna_api") {
          records = await fetchBolognaApi(source.url)
        } else if (source.format === "toscana_zip") {
          // Toscana - Pisa: ZIP con CSV all'interno
          records = await fetchToscanaZip(source.url)
        } else {
          const response = await fetch(source.url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; Santaddeo-CRM/1.0)",
              "Accept": "text/csv,application/xml,text/xml,application/json,*/*",
            },
            // Timeout via AbortController (30s per fonte)
            signal: AbortSignal.timeout(30000),
          })

          if (!response.ok) {
            results.push({ source: source.name, imported: 0, error: `HTTP ${response.status}` })
            continue
          }

          // Decodifica con encoding detection (Latin-1 fallback per portali italiani vecchi)
          const buffer = await response.arrayBuffer()
          let text = new TextDecoder("utf-8").decode(buffer)
          // Se contiene caratteri replacement (UTF-8 fallito), riprova con Latin-1
          if (text.includes("\uFFFD")) {
            text = new TextDecoder("iso-8859-1").decode(buffer)
          }

          if (source.format === "trentino_xml") {
            records = parseTrentinoXML(text)
          } else if (source.format === "xml") {
            records = parseXML(text)
          } else {
            records = parseCSV(text)
          }
        }

        if (records.length === 0) {
          results.push({ source: source.name, imported: 0, error: "Nessun record trovato nel file" })
          continue
        }

        const fields = source.fields
        const fallbackName = ["denominazione", "nome", "ragione_sociale", "insegna", "name", "nome_struttura", "nome_albergo"]
        const fallbackCategory = ["tipologia", "categoria", "tipo", "type", "tipo_struttura"]
        const fallbackStars = ["stelle", "classificazione", "stars", "categoria_stelle"]
        const fallbackAddress = ["indirizzo", "via", "address", "sede", "indirizzo_completo"]
        const fallbackCity = ["comune", "citta", "city", "localita", "nome_comune"]
        const fallbackProvince = ["provincia", "prov", "sigla_provincia"]
        const fallbackCap = ["cap", "zip", "codice_postale"]
        const fallbackPhone = ["telefono", "tel", "phone"]
        const fallbackEmail = ["email", "mail", "e_mail", "pec"]
        const fallbackWebsite = ["sitoweb", "sito_web", "sito", "web", "url", "website"]
        const fallbackRooms = ["camere", "num_camere", "n_camere", "rooms", "totale_unita", "unita"]
        const fallbackBeds = ["posti_letto", "letti", "beds", "totale_letti"]
        const fallbackLat = ["latitudine", "lat", "y", "coordy"]
        const fallbackLng = ["longitudine", "lng", "lon", "x", "coordx"]

        const prospects = records.map((r, idx) => {
          const name = getField(r, fields?.name, fallbackName)
          if (!name || name.length < 2) return null

          const provinceRaw = source.province || getField(r, fields?.province, fallbackProvince)
          const province = provinceRaw ? provinceRaw.substring(0, 30) : null
          const cityValue = getField(r, fields?.city, fallbackCity)

          // Genera source_id: priorità a idField (univoco), fallback su name+city
          let sourceId: string
          if (source.idField && r[source.idField]) {
            // Usa il campo univoco specificato dalla source (es. n_pratica, id_esercizio)
            const uniqueId = String(r[source.idField]).toLowerCase().replace(/[^a-z0-9]/g, "_").substring(0, 100)
            sourceId = `${source.region.toLowerCase()}:${source.name.toLowerCase().replace(/[^a-z0-9]/g, "_").substring(0, 30)}:${uniqueId}`
          } else {
            // Fallback storico: name+city (compatibile con import precedenti)
            sourceId = `${source.region.toLowerCase()}:${name.toLowerCase().replace(/[^a-z0-9]/g, "_").substring(0, 80)}_${cityValue.toLowerCase().replace(/[^a-z0-9]/g, "_").substring(0, 30)}`
          }

          return {
            name: name.substring(0, 255),
            category: normalizeCategory(getField(r, fields?.category, fallbackCategory)),
            stars: normalizeStars(getField(r, fields?.stars, fallbackStars)),
            address: getField(r, fields?.address, fallbackAddress).substring(0, 500) || null,
            city: cityValue.substring(0, 100) || null,
            province,
            region: source.region,
            postal_code: getField(r, fields?.cap, fallbackCap).substring(0, 10) || null,
            country: "IT",
            phone: getField(r, fields?.phone, fallbackPhone).substring(0, 50) || null,
            email: getField(r, fields?.email, fallbackEmail).substring(0, 255) || null,
            website: getField(r, fields?.website, fallbackWebsite).substring(0, 500) || null,
            rooms_count: parseIntOrNull(getField(r, fields?.rooms, fallbackRooms)),
            beds_count: parseIntOrNull(getField(r, fields?.beds, fallbackBeds)),
            latitude: parseLatitude(getField(r, fields?.lat, fallbackLat)),
            longitude: parseLongitude(getField(r, fields?.lng, fallbackLng)),
            source: "opendata",
            source_id: sourceId,
            status: "unassigned",
          }
        }).filter((p): p is NonNullable<typeof p> => p !== null)

        let imported = 0
        let lastError: string | null = null
        const batchSize = 200
        for (let i = 0; i < prospects.length; i += batchSize) {
          const batch = prospects.slice(i, i + batchSize)
          const { data, error, count } = await supabase
            .from("prospects")
            .upsert(batch, { onConflict: "source,source_id", ignoreDuplicates: true, count: "exact" })
            .select("id")
          if (error) {
            lastError = error.message
            console.error(`[v0] Upsert error for ${source.name}:`, error)
          } else {
            imported += data?.length || 0
          }
        }

        // Se errore reale, riportalo. Altrimenti 0 importate = duplicati (benigno, non un errore)
        if (lastError) {
          results.push({
            source: source.name,
            imported,
            parsed: prospects.length,
            error: lastError,
          })
        } else {
          results.push({ source: source.name, imported, parsed: prospects.length })
        }
      } catch (err: any) {
        const msg = err?.name === "AbortError" || err?.name === "TimeoutError"
          ? "Timeout (30s)"
          : String(err?.message || err)
        results.push({ source: source.name, imported: 0, error: msg })
      }
    }

    const { count } = await supabase
      .from("prospects")
      .select("*", { count: "exact", head: true })

    return NextResponse.json({
      success: true,
      results,
      totalImported: results.reduce((sum, r) => sum + r.imported, 0),
      totalInDatabase: count,
    })
  } catch (error) {
    console.error("Errore fetch OpenData:", error)
    return NextResponse.json({ error: "Errore durante l'import" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    sources: OPENDATA_SOURCES.map((s, i) => ({
      id: i,
      name: s.name,
      region: s.region,
      url: s.url,
    })),
  })
}
