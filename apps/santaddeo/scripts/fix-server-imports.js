import { execSync } from "child_process"
import fs from "fs"

// Discover project root: look for package.json with name matching our project
const findRoot = () => {
  const candidates = execSync(
    `find /vercel /home /workspace /app /srv -maxdepth 6 -name "package.json" 2>/dev/null | xargs grep -l "santaddeo\\|v0-project" 2>/dev/null | head -3`,
    { encoding: "utf-8", shell: "/bin/bash" }
  ).trim().split("\n").filter(Boolean)

  for (const c of candidates) {
    const dir = c.replace("/package.json", "")
    if (fs.existsSync(dir + "/lib/supabase/server.ts")) return dir
  }
  return null
}

let ROOT
try { ROOT = findRoot() } catch {}
if (!ROOT) {
  console.error("Cannot find project root. Trying known paths...")
  const known = ["/vercel/share/v0-project", "/home/user/santaddeo-V1", "/workspace"]
  ROOT = known.find(p => fs.existsSync(p + "/lib/supabase/server.ts")) || null
}
if (!ROOT) { console.error("Project root not found!"); process.exit(1) }

console.log(`ROOT = ${ROOT}`)

// Run the replacement via sed + find
const cmd = `
  find "${ROOT}" -type f \\( -name "*.ts" -o -name "*.tsx" \\) \\
    -not -path "*/node_modules/*" \\
    -not -path "*/.next/*" \\
    -not -path "*/scripts/*" \\
    -not -name "server.ts" \\
    -not -name "prod-client.ts" \\
    | xargs grep -l "@/lib/supabase/server" 2>/dev/null \\
    | xargs -r sed -i 's|"@/lib/supabase/server"|"@/lib/supabase/prod-client"|g'
`

console.log("Running replacement...")
try {
  execSync(cmd, { encoding: "utf-8", shell: "/bin/bash" })
} catch (e) {
  if (e.stderr && e.stderr.trim()) console.error("stderr:", e.stderr.trim())
}

// Count result
try {
  const prod = execSync(`grep -rl "@/lib/supabase/prod-client" "${ROOT}" --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l`, { encoding: "utf-8" }).trim()
  const srv  = execSync(`grep -rl "@/lib/supabase/server" "${ROOT}" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "server.ts$" | grep -v scripts | wc -l`, { encoding: "utf-8" }).trim()
  console.log(`Files using prod-client: ${prod}`)
  console.log(`Files still using server.ts (excl. server.ts & scripts): ${srv}`)
} catch {}
