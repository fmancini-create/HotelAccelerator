import { execSync } from "child_process"
// Discover where server.ts actually lives
const r = execSync("find / -name 'server.ts' -path '*/supabase/server.ts' 2>/dev/null | head -5", { encoding: "utf-8", shell: "/bin/bash" })
console.log("server.ts locations:", r)
console.log("cwd:", process.cwd())
console.log("script argv:", process.argv)
