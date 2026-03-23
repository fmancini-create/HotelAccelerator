/**
 * Script per sostituire createServerClient/createClient con createServiceClient
 * in tutte le route API admin e cms.
 * NON tocca lib/supabase/server.ts o i client-side.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs"
import { join } from "path"

const ROOT = new URL("..", import.meta.url).pathname
const API_DIR = join(ROOT, "app/api")

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...walk(full))
    } else if (full.endsWith("route.ts")) {
      files.push(full)
    }
  }
  return files
}

let changed = 0

for (const file of walk(API_DIR)) {
  // Salta la route pubblica by-slug (già sistemata) e le route non admin
  let content = readFileSync(file, "utf8")
  const original = content

  // Sostituisci import
  content = content
    .replace(
      /import\s*\{\s*createServerClient\s*\}\s*from\s*["']@\/lib\/supabase\/server["']/g,
      `import { createServiceClient } from "@/lib/supabase/server"`
    )
    .replace(
      /import\s*\{\s*createClient\s*\}\s*from\s*["']@\/lib\/supabase\/server["']/g,
      `import { createServiceClient } from "@/lib/supabase/server"`
    )
    // Sostituisci chiamate (await createServerClient() → createServiceClient())
    .replace(/await createServerClient\(\)/g, "createServiceClient()")
    .replace(/await createClient\(\)/g, "createServiceClient()")

  if (content !== original) {
    writeFileSync(file, content)
    console.log("Fixed:", file.replace(ROOT, ""))
    changed++
  }
}

console.log(`\nDone. Fixed ${changed} files.`)
