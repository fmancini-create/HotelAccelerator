import fs from "node:fs"

const api = fs.readFileSync("app/api/super-admin/crm/route.ts", "utf8")
const page = fs.readFileSync("app/super-admin/crm/page.tsx", "utf8")
const migration = fs.readFileSync("supabase/migrations/20260905181000_add_platform_customer_intelligence.sql", "utf8")

const failures = []
const requireText = (text, needle, label) => {
  if (!text.includes(needle)) failures.push(label)
}

requireText(api, "verifySuperAdmin", "API must verify super admin")
requireText(api, '.eq("property_id", fourBidPropertyId)', "prospect query must be 4BID tenant-scoped")
if (api.includes('db.from("crm_apollo_prospects").select') && !api.includes('.eq("property_id", fourBidPropertyId)')) {
  failures.push("prospect query appears unscoped")
}
requireText(page, "/api/super-admin/crm", "page must use super-admin CRM API")
requireText(page, "Customer Intelligence", "page title missing")
requireText(migration, "enable row level security", "platform CRM tables must enable RLS")
requireText(migration, "revoke all on table public.platform_customer_profiles from public, anon, authenticated", "profile table must be backend-only")

if (failures.length) {
  console.error("Super Admin CRM check failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Super Admin CRM static checks passed")
