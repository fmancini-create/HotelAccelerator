import * as fs from "fs"
import * as path from "path"

// Replace all imports of createServiceRoleClient from @/lib/supabase/server
// with the same function exported from @/lib/supabase/prod-client.
// prod-client.ts is a NEW module (not in HMR cache) that ALWAYS returns PROD.

const ROOT = path.resolve(process.cwd())
const TARGET_DIRS = [
  path.join(ROOT, "app/api"),
  path.join(ROOT, "app/accelerator"),
  path.join(ROOT, "app/admin"),
  path.join(ROOT, "lib"),
  path.join(ROOT, "components"),
]

let filesChecked = 0
let filesModified = 0

function walkDir(dir: string, callback: (filePath: string) => void) {
  if (!fs.existsSync(dir)) return
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkDir(fullPath, callback)
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      callback(fullPath)
    }
  }
}

function processFile(filePath: string) {
  // Skip prod-client itself and server.ts
  if (filePath.includes("prod-client.ts") || filePath.endsWith("lib/supabase/server.ts")) return
  // Skip sync/admin scripts that intentionally use DEV
  if (filePath.includes("sync-to-dev") || filePath.includes("bootstrap-dev") || filePath.includes("setup-dev")) return

  filesChecked++
  let content = fs.readFileSync(filePath, "utf-8")
  let changed = false

  // Pattern 1: import { createServiceRoleClient } from "@/lib/supabase/server"
  // → import { createServiceRoleClient } from "@/lib/supabase/prod-client"
  if (content.includes('"@/lib/supabase/server"') || content.includes("'@/lib/supabase/server'")) {
    const before = content

    // Replace double-quote imports
    content = content.replace(
      /from "@\/lib\/supabase\/server"/g,
      'from "@/lib/supabase/prod-client"'
    )
    // Replace single-quote imports
    content = content.replace(
      /from '@\/lib\/supabase\/server'/g,
      "from '@/lib/supabase/prod-client'"
    )

    if (content !== before) {
      changed = true
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, "utf-8")
    filesModified++
    console.log(`[fix] Updated: ${filePath.replace(ROOT, "")}`)
  }
}

for (const dir of TARGET_DIRS) {
  walkDir(dir, processFile)
}

console.log(`\nDone. Checked ${filesChecked} files, modified ${filesModified}.`)
