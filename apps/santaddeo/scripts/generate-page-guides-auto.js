// generate-page-guides-auto.js
/**
 * Build-time page guide generator.
 * Scans all page.tsx files AND their imported components to extract
 * UI features (buttons, tabs, dialogs, tables, etc.) automatically.
 * 
 * Output: /lib/page-guides-auto.json
 * This runs at build time so the guide is always up-to-date on every deploy.
 */

const { readFileSync, writeFileSync, existsSync, readdirSync, statSync } = require("fs")
const { join, resolve, dirname } = require("path")

const ROOT = process.cwd()
const APP_DIR = join(ROOT, "app")
const OUTPUT = join(ROOT, "lib", "page-guides-auto.json")

// ---- Helpers ----

/** Recursively find all page.tsx files */
function findPages(dir, pages = []) {
  if (!existsSync(dir)) return pages
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      // Skip (group) routes with parentheses in name for scanning
      findPages(full, pages)
    } else if (entry === "page.tsx") {
      pages.push(full)
    }
  }
  return pages
}

/** Convert file path to route pathname */
function fileToRoute(filePath) {
  let route = filePath
    .replace(APP_DIR, "")
    .replace("/page.tsx", "")
    .replace(/\\/g, "/")
  // Remove route groups like (authenticated)
  route = route.replace(/\/\([^)]+\)/g, "")
  return route || "/"
}

/** Resolve an import path to an actual file */
function resolveImport(importPath, fromFile) {
  // Handle @/ alias
  let resolved = importPath
  if (resolved.startsWith("@/")) {
    resolved = join(ROOT, resolved.slice(2))
  } else if (resolved.startsWith("./") || resolved.startsWith("../")) {
    resolved = resolve(dirname(fromFile), resolved)
  } else {
    return null // node_module, skip
  }

  // Try extensions
  for (const ext of [".tsx", ".ts", ".jsx", ".js", ""]) {
    const candidate = resolved + ext
    if (existsSync(candidate)) return candidate
  }
  // Try /index
  for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
    const candidate = join(resolved, "index" + ext)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** Extract local imports from a source file */
function extractImports(source) {
  const imports = []
  const regex = /import\s+.*?\s+from\s+["']([^"']+)["']/g
  let match
  while ((match = regex.exec(source)) !== null) {
    imports.push(match[1])
  }
  return imports
}

/** Read a file and all its local component imports (1 level deep for performance) */
function readWithImports(filePath, visited = new Set()) {
  if (visited.has(filePath)) return ""
  visited.add(filePath)

  let source = ""
  try {
    source = readFileSync(filePath, "utf-8")
  } catch {
    return ""
  }

  let combined = source

  // Follow imports to local components (max 2 levels deep to avoid explosion)
  if (visited.size <= 15) {
    const imports = extractImports(source)
    for (const imp of imports) {
      // Only follow @/components and relative imports
      if (imp.startsWith("@/components") || imp.startsWith("./") || imp.startsWith("../")) {
        const resolved = resolveImport(imp, filePath)
        if (resolved && !visited.has(resolved)) {
          combined += "\n" + readWithImports(resolved, visited)
        }
      }
    }
  }

  return combined
}

/** Extract UI features from combined source code */
function extractFeatures(source) {
  const features = []

  // Button labels: >Label</Button>. Filtra match con artefatti JSX
  // (parentesi, operatori ternari, callback inline tipo `setX(false)}>Label`).
  const btnRegex = />([^<{]{2,60})<\/Button>/gi
  let m
  while ((m = btnRegex.exec(source)) !== null) {
    const label = m[1].replace(/\s+/g, " ").trim()
    // Reject labels with JSX/operator artefacts
    if (
      label.length < 2 ||
      /[{}()<>[\]:;]/.test(label) ||
      /=>|&&|\|\||\?\.|\?\s*:/.test(label) ||
      /(setOpen|setShow|setBulk|setIsOpen|setEditing|setCreating|setDialog)/i.test(label)
    ) {
      continue
    }
    features.push(`Bottone: "${label}"`)
  }

  // Helper: rifiuta label "sporche" (artefatti JSX, callback, operatori).
  const isCleanLabel = (s) =>
    s.length >= 2 &&
    !/[{}()<>[\]:;]/.test(s) &&
    !/=>|&&|\|\||\?\.|\?\s*:/.test(s) &&
    !/(setOpen|setShow|setBulk|setIsOpen|setEditing|setCreating|setDialog)/i.test(s)

  // Tab triggers: <TabsTrigger value="...">Label</TabsTrigger>
  const tabRegex = /<TabsTrigger[^>]*>([^<{]+)<\/TabsTrigger>/g
  while ((m = tabRegex.exec(source)) !== null) {
    const label = m[1].replace(/\s+/g, " ").trim()
    if (isCleanLabel(label)) features.push(`Tab: "${label}"`)
  }

  // Dialog titles
  const dialogRegex = /<DialogTitle[^>]*>([^<{]+)<\/DialogTitle>/g
  while ((m = dialogRegex.exec(source)) !== null) {
    const label = m[1].replace(/\s+/g, " ").trim()
    if (isCleanLabel(label)) features.push(`Dialog: "${label}"`)
  }

  // Dialog descriptions (testo di accompagnamento ai dialog)
  const dialogDescRegex = /<DialogDescription[^>]*>([^<{]{6,200})<\/DialogDescription>/g
  while ((m = dialogDescRegex.exec(source)) !== null) {
    features.push(`Spiegazione dialog: "${m[1].trim().slice(0, 180)}"`)
  }

  // Alert descriptions (warnings/conferme inline)
  const alertDescRegex = /<AlertDescription[^>]*>([^<{]{6,200})<\/AlertDescription>/g
  while ((m = alertDescRegex.exec(source)) !== null) {
    features.push(`Avviso: "${m[1].trim().slice(0, 180)}"`)
  }

  // Card titles
  const cardRegex = /<CardTitle[^>]*>([^<{]+)<\/CardTitle>/g
  while ((m = cardRegex.exec(source)) !== null) {
    const label = m[1].replace(/\s+/g, " ").trim()
    if (isCleanLabel(label)) features.push(`Sezione: "${label}"`)
  }

  // Card descriptions (lasciamo passare anche frasi con punteggiatura)
  const cardDescRegex = /<CardDescription[^>]*>([^<{]{6,200})<\/CardDescription>/g
  while ((m = cardDescRegex.exec(source)) !== null) {
    features.push(`Descrizione sezione: "${m[1].trim().slice(0, 180)}"`)
  }

  // Link labels: <Link ...>Label</Link>
  const linkRegex = /<Link[^>]*>([^<{]{2,60})<\/Link>/g
  while ((m = linkRegex.exec(source)) !== null) {
    const label = m[1].replace(/\s+/g, " ").trim()
    if (isCleanLabel(label)) features.push(`Link: "${label}"`)
  }

  // Label for form fields
  const labelRegex = /<Label[^>]*>([^<{]{2,80})<\/Label>/g
  while ((m = labelRegex.exec(source)) !== null) {
    const label = m[1].replace(/\s+/g, " ").trim()
    if (isCleanLabel(label)) features.push(`Etichetta campo: "${label}"`)
  }

  // h1/h2/h3 titles
  for (const tag of ["h1", "h2", "h3"]) {
    const hRegex = new RegExp(`<${tag}[^>]*>([^<{]{3,80})</${tag}>`, "gi")
    while ((m = hRegex.exec(source)) !== null) {
      features.push(`Titolo: "${m[1].trim()}"`)
    }
  }

  // Select/input placeholders
  const placeholderRegex = /placeholder="([^"]{4,60})"/g
  while ((m = placeholderRegex.exec(source)) !== null) {
    features.push(`Campo: "${m[1]}"`)
  }

  // Pattern detection
  if (source.includes("<Table") || source.includes("TableHeader") || source.includes("TableRow")) {
    features.push("Tabella dati con righe e colonne")
  }
  if (source.includes("ResponsiveContainer") || source.includes("BarChart") || source.includes("LineChart") || source.includes("AreaChart")) {
    features.push("Grafico/i dati visuali")
  }
  if (source.includes("dragFill") || source.includes("drag-fill") || source.includes("onDragFill")) {
    features.push("Drag-fill: trascina il bordo di una cella per copiare il valore su celle adiacenti")
  }
  if (source.includes("bulkFill") || source.includes("Compila periodo") || source.includes("applyBulk")) {
    features.push("Compilazione multipla: applica un valore a un range di date con filtro giorni settimana")
  }
  if (source.includes("autoSave") || source.includes("autosave") || source.includes("debouncedSave")) {
    features.push("Autosave: le modifiche vengono salvate automaticamente")
  }
  if (source.includes("prevMonth") || source.includes("nextMonth") || source.includes("navigateMonth")) {
    features.push("Navigazione mese/periodo con frecce avanti/indietro")
  }
  if (/\b(download|export|CSV|xlsx)\b/i.test(source)) {
    features.push("Esportazione/download dati")
  }
  if (source.includes("DatePicker") || source.includes("CalendarIcon") || source.includes("date-picker")) {
    features.push("Selettore data")
  }
  if (source.includes("toast") || source.includes("useToast")) {
    features.push("Notifiche toast per conferma azioni")
  }
  if (source.includes("useForm") || source.includes("<form") || source.includes("onSubmit")) {
    features.push("Form con validazione e salvataggio")
  }
  if (source.includes("Accordion") || source.includes("Collapsible")) {
    features.push("Sezioni espandibili/comprimibili")
  }
  if (source.includes("Switch") && source.includes("checked")) {
    features.push("Toggle on/off per attivare/disattivare opzioni")
  }
  if (source.includes("Pagination") || source.includes("nextPage") || source.includes("prevPage")) {
    features.push("Paginazione dei risultati")
  }
  if (source.includes("search") || source.includes("Search") || source.includes("filter")) {
    features.push("Ricerca/filtro dati")
  }

  // ─── Pattern recenti (aggiornati 02/05/2026) ──────────────────────────
  if (/push-range|pushRange|Push range|push.*PMS/i.test(source)) {
    features.push("Push prezzi al PMS: invia in massa i prezzi calcolati su un range di date")
  }
  if (/autopilot|Autopilot/i.test(source)) {
    features.push("Modalita' Autopilot: il sistema pubblica i prezzi al PMS automaticamente quando cambiano")
  }
  if (/duplicateDialog|force_create|conflicts.*match_kind/i.test(source)) {
    features.push("Dialog di conferma duplicati: blocca creazioni con stesso nome/ID PMS e propone di modificare l'esistente")
  }
  if (/night-rate-override|nightRateOverride|Override tariffa/i.test(source)) {
    features.push("Override tariffa per singola notte: assegna manualmente la tariffa corretta a un booking dal Guard")
  }
  if (/AlgorithmExplanationDialog|Come funziona\?|algoritmo selezionato/i.test(source)) {
    features.push("Spiegazione algoritmo: pulsante che apre un dialog con la guida del motore di pricing attivo")
  }
  if (/k_variables|K-driven|kIntensity|K_INTENSITY/i.test(source)) {
    features.push("Variabili K (K-driven): pesi 0-10 per occupancy, lead time, day of week, booking pace, stagionalita', cancellazioni, meteo, reputation; producono il coefficiente K che modula gli incrementi della pipeline")
  }
  if (/algorithmType.*basic|algorithmType.*advanced/i.test(source)) {
    features.push("Selettore algoritmo: passa tra Base (regole semplici) e K-driven (8 variabili di mercato)")
  }
  if (/cleanup-pricing-grid-occ|fuori range|out-of-range/i.test(source)) {
    features.push("Cleanup automatico: quando si stringe il range occupanza di una camera, le righe pricing_grid orfane vengono rimosse")
  }
  if (/coverage-report|copertura|coverage_pct/i.test(source)) {
    features.push("Report copertura pricing: percentuale di celle con prezzo valido vs target")
  }
  if (/ai-report|AI Report|generateReport/i.test(source)) {
    features.push("AI Report: genera narrativa di analisi su un periodo con KPI e confronti YoY/periodo precedente")
  }
  if (/last_sent_prices|lastSentPrices/i.test(source)) {
    features.push("Tracking ultimi prezzi inviati al PMS: confronto fra grid corrente e ultimo push")
  }
  if (/price_change_log|priceChangeLog|Storico prezzi/i.test(source)) {
    features.push("Storico cambi prezzo: chi/quando/come ha modificato un prezzo (manuale, algoritmo, autopilot)")
  }
  if (/hotel_events|hotelEvents|local_event/i.test(source)) {
    features.push("Eventi locali: marca date con impact low/medium/high che influenzano la variabile k_events_local")
  }
  if (/objectives|Obiettivi|target_revenue/i.test(source)) {
    features.push("Pagina Obiettivi: produzione vs target con colonne DC/CSG/CM/CCA/CCC/AS/PS/CH per filtro stati")
  }
  if (/Guard.*scan|guard\/scan|Mismatch|Attenzione/i.test(source) && /Guard/.test(source)) {
    features.push("Guard prezzi: rileva prenotazioni con prezzo lontano dall'expected (Mismatch >5%, Attenzione 1-5%, OK <1%)")
  }

  // Deduplicate
  return [...new Set(features)].slice(0, 40)
}

// ---- Main ----

console.log("[page-guides] Scanning pages in", APP_DIR, "...")
const pages = existsSync(APP_DIR) ? findPages(APP_DIR) : []
console.log(`[page-guides] Found ${pages.length} pages`)

if (pages.length === 0) {
  console.log("[page-guides] No pages found, keeping existing JSON")
  process.exit(0)
}

const autoGuides = {}

for (const pagePath of pages) {
  const route = fileToRoute(pagePath)
  
  // Skip API routes, not-found, error pages
  if (route.includes("/api/") || route.includes("not-found") || route.includes("error")) continue

  console.log(`[page-guides] Analyzing ${route} ...`)
  const combinedSource = readWithImports(pagePath)
  const features = extractFeatures(combinedSource)

  if (features.length > 0) {
    autoGuides[route] = {
      features,
      scannedAt: new Date().toISOString(),
      sourceFiles: combinedSource.length,
    }
  }
}

writeFileSync(OUTPUT, JSON.stringify(autoGuides, null, 2), "utf-8")
console.log(`[page-guides] Written ${Object.keys(autoGuides).length} page guides to ${OUTPUT}`)
