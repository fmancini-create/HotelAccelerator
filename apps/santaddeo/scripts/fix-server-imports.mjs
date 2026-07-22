/**
 * fix-server-imports.mjs
 * 
 * Replaces all imports of createServiceRoleClient from server.ts
 * with getProdServiceClient from prod-client.ts across all API routes.
 * 
 * Run: node scripts/fix-server-imports.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs"
import { join, extname } from "path"

const ROOT = new URL("..", import.meta.url).pathname
const API_DIR = join(ROOT, "app/api")
const LIB_DIRS = [join(ROOT, "app"), join(ROOT, "lib"), join(ROOT, "components")]

let filesChanged = 0

function processFile(filePath) {
  const ext = extname(filePath)
  if (![".ts", ".tsx"].includes(ext)) return

  let content = readFileSync(filePath, "utf-8")
  const original = content

  // Replace: import { createServiceRoleClient } from "@/lib/supabase/server"
  // With:    import { getProdServiceClient as createServiceRoleClient } from "@/lib/supabase/prod-client"
  content = content.replace(
    /import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/supabase\/server["']/g,
    (match, imports) => {
      const importList = imports.split(",").map(s => s.trim()).filter(Boolean)
      const hasServiceRole = importList.some(i => i.includes("createServiceRoleClient"))
      const otherImports = importList.filter(i => !i.includes("createServiceRoleClient"))
      
      const lines = []
      if (otherImports.length > 0) {
        lines.push(`import { ${otherImports.join(", ")} } from "@/lib/supabase/server"`)
      }
      if (hasServiceRole) {
        lines.push(`import { getProdServiceClient as createServiceRoleClient } from "@/lib/supabase/prod-client"`)
      }
      return lines.join("\n")
    }
  )

  if (content !== original) {
    writeFileSync(filePath, content, "utf-8")
    filesChanged++
    console.log("Updated:", filePath.replace(ROOT, ""))
  }
}

function walkDir(dir) {
  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const stat = statSync(fullPath)
      if (stat.isDirectory() && !entry.startsWith(".") && entry !== "node_modules" && entry !== ".next") {
        walkDir(fullPath)
      } else if (stat.isFile()) {
        processFile(fullPath)
      }
    }
  } catch {}
}

console.log("Scanning for createServiceRoleClient imports...")
walkDir(join(ROOT, "app"))
walkDir(join(ROOT, "lib"))
walkDir(join(ROOT, "components"))

console.log(`\nDone! Updated ${filesChanged} files.`)
