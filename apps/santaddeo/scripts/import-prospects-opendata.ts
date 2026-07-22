/**
 * Script per importare strutture ricettive italiane da fonti OpenData regionali
 * 
 * Eseguire con: npx tsx scripts/import-prospects-opendata.ts
 * 
 * Fonti:
 * - Trentino: dati.trentino.it
 * - Umbria: dati.regione.umbria.it
 * - Puglia: dati.puglia.it
 * - Milano: dati.comune.milano.it
 * - Matera: dati.comune.matera.it
 * - Roma: dati.comune.roma.it
 */

import { createClient } from "@supabase/supabase-js"
import * as fs from "fs"
import * as path from "path"

// Configurazione Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Mancano le variabili NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Fonti dati OpenData con URL diretti ai CSV
const DATA_SOURCES = [
  {
    name: "Trentino - Esercizi Alberghieri",
    url: "https://dati.trentino.it/dataset/d7c1e027-8a3e-4b26-9d01-90c9a9e42cb4/resource/c3c7b85a-1a3e-4e14-a0b4-3db8a7b3e7a1/download/esercizi-alberghieri.csv",
    region: "Trentino-Alto Adige",
    mapping: {
      name: ["denominazione", "nome", "ragione_sociale", "insegna"],
      category: ["tipologia", "categoria_struttura", "tipo"],
      stars: ["stelle", "classificazione", "categoria"],
      address: ["indirizzo", "via", "sede"],
      city: ["comune", "citta", "localita"],
      province: ["provincia", "prov"],
      postal_code: ["cap", "codice_postale"],
      phone: ["telefono", "tel", "recapito"],
      email: ["email", "pec", "mail"],
      website: ["sito", "sito_web", "web", "url"],
      rooms_count: ["camere", "num_camere", "n_camere"],
      beds_count: ["posti_letto", "letti", "num_letti"],
      latitude: ["latitudine", "lat", "y"],
      longitude: ["longitudine", "lng", "lon", "x"],
    }
  },
  {
    name: "Umbria - Strutture Ricettive",
    url: "https://dati.regione.umbria.it/api/3/action/datastore_search?resource_id=strutture-ricettive&limit=50000",
    region: "Umbria",
    isApi: true,
    mapping: {
      name: ["denominazione", "nome_struttura", "ragione_sociale"],
      category: ["tipologia", "tipo_struttura"],
      stars: ["stelle", "classificazione"],
      address: ["indirizzo", "via"],
      city: ["comune"],
      province: ["provincia"],
      postal_code: ["cap"],
      phone: ["telefono"],
      email: ["email"],
      website: ["sito_web"],
      rooms_count: ["camere"],
      beds_count: ["posti_letto"],
    }
  },
  {
    name: "Puglia - Strutture Ricettive",
    url: "https://dati.puglia.it/ckan/dataset/puglia-elenco-delle-strutture-ricettive-e-delle-locazioni-turistiche-progressivo/resource/download",
    region: "Puglia",
    mapping: {
      name: ["denominazione", "nome", "ragione_sociale"],
      category: ["tipologia", "tipo"],
      stars: ["stelle", "categoria"],
      address: ["indirizzo", "via"],
      city: ["comune", "localita"],
      province: ["provincia"],
      postal_code: ["cap"],
      phone: ["telefono"],
      email: ["email", "pec"],
      website: ["sito", "web"],
      rooms_count: ["camere", "n_camere"],
      beds_count: ["posti_letto"],
    }
  },
]

// Normalizzazione categorie
const CATEGORY_MAPPING: Record<string, string> = {
  "albergo": "hotel",
  "hotel": "hotel",
  "motel": "hotel",
  "residence": "residence",
  "residenza": "residence",
  "b&b": "bb",
  "bed and breakfast": "bb",
  "bed & breakfast": "bb",
  "affittacamere": "affittacamere",
  "agriturismo": "agriturismo",
  "campeggio": "camping",
  "camping": "camping",
  "villaggio turistico": "villaggio",
  "villaggio": "villaggio",
  "ostello": "ostello",
  "rifugio": "rifugio",
  "casa vacanze": "casa_vacanze",
  "casa vacanza": "casa_vacanze",
  "appartamento": "appartamento",
  "locazione turistica": "locazione",
}

function normalizeCategory(raw: string): string {
  if (!raw) return "altro"
  const lower = raw.toLowerCase().trim()
  for (const [key, value] of Object.entries(CATEGORY_MAPPING)) {
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

function normalizeProvince(raw: string): string {
  if (!raw) return ""
  // Se è già una sigla di 2 caratteri
  if (/^[A-Z]{2}$/.test(raw.toUpperCase())) {
    return raw.toUpperCase()
  }
  // Mapping province comuni
  const mapping: Record<string, string> = {
    "roma": "RM", "milano": "MI", "napoli": "NA", "torino": "TO",
    "firenze": "FI", "bologna": "BO", "venezia": "VE", "genova": "GE",
    "palermo": "PA", "bari": "BA", "catania": "CT", "verona": "VR",
    "padova": "PD", "brescia": "BS", "bergamo": "BG", "modena": "MO",
    "parma": "PR", "reggio emilia": "RE", "perugia": "PG", "terni": "TR",
    "trento": "TN", "bolzano": "BZ", "trieste": "TS", "udine": "UD",
    "ancona": "AN", "pesaro": "PU", "macerata": "MC", "ascoli piceno": "AP",
    "l'aquila": "AQ", "pescara": "PE", "chieti": "CH", "teramo": "TE",
    "campobasso": "CB", "isernia": "IS", "potenza": "PZ", "matera": "MT",
    "cosenza": "CS", "catanzaro": "CZ", "reggio calabria": "RC",
    "lecce": "LE", "brindisi": "BR", "taranto": "TA", "foggia": "FG",
    "cagliari": "CA", "sassari": "SS", "nuoro": "NU", "oristano": "OR",
    "siena": "SI", "pisa": "PI", "livorno": "LI", "lucca": "LU",
    "arezzo": "AR", "grosseto": "GR", "prato": "PO", "pistoia": "PT",
    "massa": "MS", "carrara": "MS",
  }
  const lower = raw.toLowerCase().trim()
  return mapping[lower] || raw.substring(0, 2).toUpperCase()
}

// Trova il valore in un record usando mapping di colonne possibili
function findValue(record: Record<string, any>, possibleKeys: string[]): string {
  for (const key of possibleKeys) {
    // Cerca key esatto
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") {
      return String(record[key]).trim()
    }
    // Cerca key case-insensitive
    const lowerKey = key.toLowerCase()
    for (const [k, v] of Object.entries(record)) {
      if (k.toLowerCase() === lowerKey && v !== undefined && v !== null && v !== "") {
        return String(v).trim()
      }
    }
  }
  return ""
}

// Parse CSV semplice
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  
  // Detect separator
  const firstLine = lines[0]
  const separator = firstLine.includes(";") ? ";" : ","
  
  const headers = firstLine.split(separator).map(h => h.trim().replace(/^"|"$/g, "").toLowerCase())
  const records: Record<string, string>[] = []
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(separator).map(v => v.trim().replace(/^"|"$/g, ""))
    if (values.length !== headers.length) continue
    
    const record: Record<string, string> = {}
    headers.forEach((h, idx) => {
      record[h] = values[idx] || ""
    })
    records.push(record)
  }
  
  return records
}

// Trasforma record in formato prospects
function transformRecord(
  record: Record<string, any>,
  source: typeof DATA_SOURCES[0]
): Record<string, any> | null {
  const mapping = source.mapping
  
  const name = findValue(record, mapping.name)
  if (!name) return null // Nome obbligatorio
  
  const rawCategory = findValue(record, mapping.category)
  const rawStars = findValue(record, mapping.stars)
  
  return {
    name,
    category: normalizeCategory(rawCategory),
    stars: normalizeStars(rawStars),
    address: findValue(record, mapping.address) || null,
    city: findValue(record, mapping.city) || null,
    province: normalizeProvince(findValue(record, mapping.province)),
    region: source.region,
    postal_code: findValue(record, mapping.postal_code) || null,
    country: "IT",
    phone: findValue(record, mapping.phone) || null,
    email: findValue(record, mapping.email) || null,
    website: findValue(record, mapping.website) || null,
    rooms_count: parseInt(findValue(record, mapping.rooms_count)) || null,
    beds_count: parseInt(findValue(record, mapping.beds_count)) || null,
    latitude: mapping.latitude ? parseFloat(findValue(record, mapping.latitude)) || null : null,
    longitude: mapping.longitude ? parseFloat(findValue(record, mapping.longitude)) || null : null,
    source: "opendata",
    source_id: `${source.name.toLowerCase().replace(/\s+/g, "_")}:${name.toLowerCase().replace(/\s+/g, "_").substring(0, 50)}`,
    status: "unassigned",
  }
}

// Fetch e processa una fonte
async function processSource(source: typeof DATA_SOURCES[0]): Promise<number> {
  console.log(`\n📥 Scaricando: ${source.name}...`)
  
  try {
    const response = await fetch(source.url, {
      headers: {
        "User-Agent": "Santaddeo-CRM/1.0 (OpenData Import)",
        "Accept": "text/csv,application/json,*/*"
      }
    })
    
    if (!response.ok) {
      console.error(`   ❌ Errore HTTP ${response.status}`)
      return 0
    }
    
    let records: Record<string, any>[] = []
    
    if (source.isApi) {
      // API JSON (es. CKAN)
      const json = await response.json()
      records = json.result?.records || json.records || []
    } else {
      // CSV
      const text = await response.text()
      records = parseCSV(text)
    }
    
    console.log(`   📊 Trovati ${records.length} record`)
    
    if (records.length === 0) return 0
    
    // Trasforma i record
    const prospects = records
      .map(r => transformRecord(r, source))
      .filter((p): p is NonNullable<typeof p> => p !== null)
    
    console.log(`   ✅ ${prospects.length} record validi dopo trasformazione`)
    
    if (prospects.length === 0) return 0
    
    // Insert in batch da 500
    const batchSize = 500
    let inserted = 0
    
    for (let i = 0; i < prospects.length; i += batchSize) {
      const batch = prospects.slice(i, i + batchSize)
      
      const { error, count } = await supabase
        .from("prospects")
        .upsert(batch, {
          onConflict: "source,source_id",
          ignoreDuplicates: true
        })
      
      if (error) {
        console.error(`   ⚠️ Errore batch ${i / batchSize + 1}: ${error.message}`)
      } else {
        inserted += batch.length
        process.stdout.write(`   💾 Inseriti ${inserted}/${prospects.length}\r`)
      }
    }
    
    console.log(`   ✅ Completato: ${inserted} strutture importate`)
    return inserted
    
  } catch (err) {
    console.error(`   ❌ Errore: ${err}`)
    return 0
  }
}

// Import da file CSV locale
async function importLocalCSV(filePath: string, region: string): Promise<number> {
  console.log(`\n📁 Importando file locale: ${filePath}...`)
  
  if (!fs.existsSync(filePath)) {
    console.error(`   ❌ File non trovato: ${filePath}`)
    return 0
  }
  
  const content = fs.readFileSync(filePath, "utf-8")
  const records = parseCSV(content)
  
  console.log(`   📊 Trovati ${records.length} record`)
  
  const source = {
    name: `local_${path.basename(filePath)}`,
    url: filePath,
    region,
    mapping: {
      name: ["nome", "denominazione", "ragione_sociale", "insegna", "name"],
      category: ["tipologia", "categoria", "tipo", "category", "type"],
      stars: ["stelle", "classificazione", "stars", "rating"],
      address: ["indirizzo", "via", "address", "street"],
      city: ["comune", "citta", "city", "localita"],
      province: ["provincia", "prov", "province"],
      postal_code: ["cap", "zip", "postal_code"],
      phone: ["telefono", "tel", "phone"],
      email: ["email", "pec", "mail"],
      website: ["sito", "sito_web", "web", "url", "website"],
      rooms_count: ["camere", "num_camere", "rooms"],
      beds_count: ["posti_letto", "letti", "beds"],
      latitude: ["latitudine", "lat", "y", "latitude"],
      longitude: ["longitudine", "lng", "lon", "x", "longitude"],
    }
  }
  
  const prospects = records
    .map(r => transformRecord(r, source as typeof DATA_SOURCES[0]))
    .filter((p): p is NonNullable<typeof p> => p !== null)
  
  console.log(`   ✅ ${prospects.length} record validi`)
  
  // Insert in batch
  const batchSize = 500
  let inserted = 0
  
  for (let i = 0; i < prospects.length; i += batchSize) {
    const batch = prospects.slice(i, i + batchSize)
    
    const { error } = await supabase
      .from("prospects")
      .upsert(batch, {
        onConflict: "source,source_id",
        ignoreDuplicates: true
      })
    
    if (error) {
      console.error(`   ⚠️ Errore batch: ${error.message}`)
    } else {
      inserted += batch.length
    }
  }
  
  console.log(`   ✅ Completato: ${inserted} strutture importate`)
  return inserted
}

// Main
async function main() {
  console.log("🏨 IMPORT STRUTTURE RICETTIVE ITALIANE")
  console.log("======================================\n")
  
  // Check argomenti per file locale
  const args = process.argv.slice(2)
  if (args.length >= 2 && args[0] === "--file") {
    const filePath = args[1]
    const region = args[2] || "Italia"
    await importLocalCSV(filePath, region)
    return
  }
  
  // Import da fonti OpenData
  let totalImported = 0
  
  for (const source of DATA_SOURCES) {
    const count = await processSource(source)
    totalImported += count
  }
  
  console.log("\n======================================")
  console.log(`🎉 TOTALE IMPORTATO: ${totalImported} strutture`)
  
  // Stats finali
  const { count } = await supabase
    .from("prospects")
    .select("*", { count: "exact", head: true })
  
  console.log(`📊 Totale prospects in database: ${count}`)
}

main().catch(console.error)
