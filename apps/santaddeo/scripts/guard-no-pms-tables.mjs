#!/usr/bin/env node
/**
 * Guard script: Enforces NO PMS/provider raw table/column references in UI code,
 * and enforces UI DB queries only against canonical tables (rms_* + allowlist).
 *
 * Scans only: app/** and components/**
 *
 * EXCLUDED (NOT scanned):
 * - app/api/**, app/debug/**, app/admin/**, app/settings/**
 * - app/actions/** (server actions can talk to PMS/config)
 * - lib/connectors/**, lib/services/**, lib/etl/**
 * - components/setup/**, components/settings/**, components/onboarding/**, components/superadmin/**
 * - components/dashboard/** (Dashboard server components do legitimate data fetching)
 *
 * UI RULES:
 * - Allowed to contain "/api/" lines (fetch paths)
 * - Must NOT reference raw/PMS table/column tokens (Guard 1)
 * - Any supabase query `.from("...")` in UI must target:
 *    - tables starting with "rms_"
 *    - OR one of ALLOWED_UI_TABLES (Guard 2)
 */

import { readdir, readFile, stat } from "fs/promises"
import { join, relative } from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = join(__dirname, "..")

// ============================
// Guard 1: forbidden raw/PMS tokens (case-insensitive substring match)
// ============================
const FORBIDDEN_TOKENS = [
  // Raw table patterns
  "_raw_bookings",
  "_raw_availability",
  "_raw_",
  "raw_data",
  "scidoo_raw_",
  "cloudbeds_raw_",

  // External/PMS-specific column patterns
  "scidoo_room_type_id",
  "room_type_external_id",
  "pms_booking_id",
  "external_booking_id",
]

// ============================
// Guard 2: UI can query ONLY rms_* + allowlist (via .from("table"))
// ============================
const ALLOWED_UI_TABLES = [
  "room_types",
  "hotels",
  "pms_integrations",
  "bookings_full",
  "bookings",
  "rates",
  "daily_availability",
  // Pricing and revenue management tables (SantaAddeo core)
  "occupancy_band_groups",
  "occupancy_bands",
  "last_minute_levels",
  "pricing_grid",
  "pricing_algo_params",
  "daily_production",
  "rate_limits",
]

// ============================
// Guard 3: API business routes MUST NOT use scidoo_raw_* tables
// These routes must use normalized tables (bookings, daily_availability, etc.)
// Only connector/admin/data-inspection routes are allowed to access raw tables.
// ============================
const API_BUSINESS_ROUTES_FORBIDDEN_RAW = [
  // These patterns match API routes that perform BUSINESS LOGIC
  // and MUST be connector-agnostic (use normalized tables only)
  /^app\/api\/accelerator\//,
  /^app\/api\/dashboard\//,
  /^app\/api\/ai-chat\//,
]

// API routes ALLOWED to use raw PMS tables (connectors, admin, data tools)
const API_RAW_ALLOWED = [
  /^app\/api\/admin\//,
  /^app\/api\/superadmin\//,
  /^app\/api\/setup\//,
  /^app\/api\/cron\//,
  /^app\/api\/dati\//,  // data inspection tools (temporary until migrated)
  /^app\/api\/debug\//,
]

// Set to true when ALL business APIs have been migrated to normalized tables.
// When true, Guard 3 violations will BLOCK the build (exit code 1).
// When false, Guard 3 violations are logged as WARNINGS only.
const GUARD3_BLOCKING = false

const RAW_PMS_TABLES = [
  "scidoo_raw_bookings",
  "scidoo_raw_availability",
  "scidoo_raw_rates",
  "scidoo_raw_room_types",
  "scidoo_raw_fiscal_production",
  "cloudbeds_raw_bookings",
  "cloudbeds_raw_availability",
]

/**
 * Guard 3: check if API business route uses raw PMS tables
 */
function findRawTableInBusinessAPI(line) {
  if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) return []
  const found = []
  const lowerLine = line.toLowerCase()
  for (const table of RAW_PMS_TABLES) {
    if (lowerLine.includes(table)) found.push(table)
  }
  return found
}

function isBusinessAPIRoute(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/")
  return API_BUSINESS_ROUTES_FORBIDDEN_RAW.some((p) => p.test(normalized))
}

function isRawAllowedAPIRoute(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/")
  return API_RAW_ALLOWED.some((p) => p.test(normalized))
}

// Directories to scan
const SCAN_DIRS = ["app", "components"]

// File extensions to check
const FILE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"]

// Ignore patterns
const IGNORE_PATTERNS = [/node_modules/, /\.next/, /\.git/, /dist/, /build/]

// Excluded paths (NOT scanned)
const ALLOWED_PATHS = [
  // API and backend
  /^app\/api\//,
  /^app\/actions\//,
  /^lib\/connectors\//,
  /^lib\/services\//,
  /^lib\/etl\//,

  // Admin/debug/settings/data-inspection pages
  /^app\/debug\//,
  /^app\/admin\//,
  /^app\/settings\//,
  /^app\/dati\//,
  /^app\/accelerator\/(?!.*\/route\.ts$)/,  // accelerator pages (not API routes)

  // Setup and configuration components
  /^components\/setup\//,
  /^components\/settings\//,
  /^components\/onboarding\//,
  /^components\/superadmin\//,

  /^components\/dashboard\//,
]

function shouldIgnore(filePath) {
  return IGNORE_PATTERNS.some((pattern) => pattern.test(filePath))
}

function isAllowedPath(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/")
  return ALLOWED_PATHS.some((pattern) => pattern.test(normalized))
}

/**
 * Guard 1: forbidden token match
 * - SKIP lines containing "/api/" (API paths are allowed)
 */
function findForbiddenTokens(line) {
  if (line.includes("/api/")) return []

  const found = []
  const lowerLine = line.toLowerCase()

  for (const token of FORBIDDEN_TOKENS) {
    if (lowerLine.includes(token.toLowerCase())) found.push(token)
  }

  return found
}

/**
 * Guard 2: find `.from("table")` occurrences and validate table name.
 * - SKIP lines containing "/api/" (fetch paths are allowed)
 */
function findForbiddenFromTables(line) {
  if (line.includes("/api/")) return []

  // match: .from("table") or .from('table') or .from(`table`)
  const regex = /\.from$$\s*(['"`])([^'"`]+)\1\s*$$/g
  const violations = []

  let match
  while ((match = regex.exec(line)) !== null) {
    const rawName = (match[2] || "").trim()
    if (!rawName) continue

    // if someone writes "public.table", keep only table part
    const tableName = rawName.includes(".") ? rawName.split(".").pop() : rawName

    const isRms = tableName.startsWith("rms_")
    const isAllowed = ALLOWED_UI_TABLES.includes(tableName)

    if (!isRms && !isAllowed) {
      violations.push(tableName)
    }
  }

  return violations
}

async function scanDirectory(dir, violations = []) {
  try {
    const entries = await readdir(dir)

    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const relativePath = relative(ROOT, fullPath)

      if (shouldIgnore(relativePath)) continue

      // For API business routes: run Guard 3 (no raw PMS tables)
      const isBizAPI = isBusinessAPIRoute(relativePath)
      const isRawAllowed = isRawAllowedAPIRoute(relativePath)

      // Skip if it's an allowed-path AND not a business API route
      if (isAllowedPath(relativePath) && !isBizAPI) continue

      const stats = await stat(fullPath)

      if (stats.isDirectory()) {
        await scanDirectory(fullPath, violations)
      } else if (stats.isFile() && FILE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
        const content = await readFile(fullPath, "utf-8")
        const lines = content.split("\n")

        lines.forEach((line, index) => {
          // Guard 1 (UI only -- not API routes)
          if (!isBizAPI && !isRawAllowed && !relativePath.startsWith("app/api/")) {
            const tokens = findForbiddenTokens(line)
            if (tokens.length > 0) {
              violations.push({
                type: "FORBIDDEN_TOKEN",
                file: relativePath,
                line: index + 1,
                content: line.trim().substring(0, 160),
                tokens,
              })
            }
          }

          // Guard 2 (UI only -- not API routes)
          if (!isBizAPI && !relativePath.startsWith("app/api/")) {
            const badTables = findForbiddenFromTables(line)
            if (badTables.length > 0) {
              violations.push({
                type: "FORBIDDEN_FROM_TABLE",
                file: relativePath,
                line: index + 1,
                content: line.trim().substring(0, 160),
                tokens: badTables.map((t) => `.from("${t}")`),
              })
            }
          }

          // Guard 3: Business API routes must NOT use raw PMS tables
          if (isBizAPI && !isRawAllowed) {
            const rawTables = findRawTableInBusinessAPI(line)
            if (rawTables.length > 0) {
              violations.push({
                type: "API_RAW_TABLE_VIOLATION",
                file: relativePath,
                line: index + 1,
                content: line.trim().substring(0, 160),
                tokens: rawTables,
              })
            }
          }
        })
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`Error scanning ${dir}:`, error.message)
    }
  }

  return violations
}

async function main() {
  console.log("Guard: checking UI for PMS/raw tokens AND non-canonical DB .from() usage...\n")

  const allViolations = []

  for (const dir of SCAN_DIRS) {
    const dirPath = join(ROOT, dir)
    const violations = await scanDirectory(dirPath)
    allViolations.push(...violations)
  }

  // Separate Guard 1/2 (always blocking) from Guard 3 (warning or blocking)
  const blockingViolations = allViolations.filter((v) => v.type !== "API_RAW_TABLE_VIOLATION")
  const guard3Violations = allViolations.filter((v) => v.type === "API_RAW_TABLE_VIOLATION")

  // Print Guard 3 warnings/errors
  if (guard3Violations.length > 0) {
    const prefix = GUARD3_BLOCKING ? "GUARD 3 FAILED" : "GUARD 3 WARNING (not blocking yet)"
    console.warn(`\n${prefix}: ${guard3Violations.length} API route(s) still use raw PMS tables!\n`)
    console.warn("These API routes MUST be migrated to use normalized tables (bookings, daily_availability, etc.):\n")
    const byFile3 = {}
    for (const v of guard3Violations) {
      if (!byFile3[v.file]) byFile3[v.file] = []
      byFile3[v.file].push(v)
    }
    for (const [file, violations] of Object.entries(byFile3)) {
      console.warn(`  ${file}:`)
      for (const v of violations) {
        console.warn(`    Line ${v.line}: ${v.tokens.join(", ")}`)
      }
    }
    console.warn("\nSet GUARD3_BLOCKING = true in guard-no-pms-tables.mjs once migration is complete.\n")

    if (GUARD3_BLOCKING) {
      blockingViolations.push(...guard3Violations)
    }
  }

  if (blockingViolations.length > 0) {
    console.error("GUARD FAILED: Found violations!\n")

    // Group by file
    const byFile = {}
    for (const v of blockingViolations) {
      if (!byFile[v.file]) byFile[v.file] = []
      byFile[v.file].push(v)
    }

    for (const [file, violations] of Object.entries(byFile)) {
      console.error(`\nFile: ${file}`)
      for (const v of violations) {
        console.error(`  Line ${v.line}: [${v.type}] ${v.tokens.join(", ")}`)
        console.error(`    ${v.content}`)
      }
    }

    console.error("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    console.error("FIX RULES:")
    console.error("")
    console.error("Guard 1 & 2 (UI code):")
    console.error("  - UI must NOT contain raw/PMS tokens (raw/scidoo_raw/etc.)")
    console.error('  - UI `.from("...")` must target only: rms_* OR allowlist tables:')
    console.error(`    ${ALLOWED_UI_TABLES.join(", ")}`)
    console.error("  - If you need PMS/provider logic -> move it to app/api/** or lib/services/**")
    console.error("")
    console.error("Guard 3 (API business routes - CONNECTOR AGNOSTIC):")
    console.error("  - API routes in accelerator/, dashboard/, ai-chat/ must NOT use raw PMS tables")
    console.error("  - Use ONLY normalized tables: bookings, daily_availability, room_types, rates")
    console.error("  - Raw tables (scidoo_raw_*, cloudbeds_raw_*) are ONLY for:")
    console.error("    connectors, admin, superadmin, cron, dati (data inspection)")
    console.error("  - This ensures the platform works for ALL PMS connectors (Scidoo, Bedzzle, etc.)")
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")

    process.exit(1)
  }

  if (guard3Violations.length > 0) {
    console.log("✓ Guard passed (with warnings): UI is clean. Some API routes still need migration (see warnings above).\n")
  } else {
    console.log("✓ Guard passed: UI is clean, API business routes are connector-agnostic.\n")
  }
  process.exit(0)
}

main().catch((err) => {
  console.error("Guard script error:", err)
  process.exit(1)
})
