import fs from "node:fs"

const api = fs.readFileSync("app/api/super-admin/crm/route.ts", "utf8")
const page = fs.readFileSync("app/super-admin/crm/page.tsx", "utf8")
const layout = fs.readFileSync("app/super-admin/crm/layout.tsx", "utf8")
const supportApi = fs.readFileSync("app/api/super-admin/crm/support/route.ts", "utf8")
const supportPage = fs.readFileSync("app/super-admin/crm/support/page.tsx", "utf8")
const successApi = fs.readFileSync("app/api/super-admin/crm/success/route.ts", "utf8")
const successPage = fs.readFileSync("app/super-admin/crm/success/page.tsx", "utf8")
const migration = fs.readFileSync("supabase/migrations/20260905161531_add_platform_customer_intelligence.sql", "utf8")
const supportMigration = fs.readFileSync("supabase/migrations/20260906204500_add_superadmin_support_customer_success.sql", "utf8")

const failures = []
const requireText = (text, needle, label) => {
  if (!text.includes(needle)) failures.push(label)
}

requireText(api, "verifySuperAdmin", "API must verify super admin")
requireText(api, '.eq("property_id", fourBidPropertyId)', "prospect query must be 4BID tenant-scoped")
requireText(page, "/api/super-admin/crm", "page must use super-admin CRM API")
requireText(page, "Customer Intelligence", "page title missing")
requireText(layout, "SuperAdminCrmNav", "CRM area navigation missing")
requireText(supportApi, "verifySuperAdmin", "support API must verify super admin")
requireText(successApi, "verifySuperAdmin", "customer success API must verify super admin")
requireText(supportPage, "/api/super-admin/crm/support", "support page must use protected support API")
requireText(successPage, "/api/super-admin/crm/success", "success page must use protected success API")
requireText(migration, "enable row level security", "platform CRM tables must enable RLS")
requireText(
  migration,
  "revoke all on table public.platform_customer_profiles from public, anon, authenticated",
  "profile table must be backend-only",
)
requireText(supportMigration, "alter table public.platform_support_cases enable row level security", "support cases must enable RLS")
requireText(supportMigration, "alter table public.platform_customer_success_actions enable row level security", "success actions must enable RLS")
requireText(
  supportMigration,
  "revoke all on table public.platform_support_cases from public, anon, authenticated",
  "support cases must be backend-only",
)
requireText(
  supportMigration,
  "revoke all on table public.platform_customer_success_actions from public, anon, authenticated",
  "success actions must be backend-only",
)

if (failures.length) {
  console.error("Super Admin CRM check failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Super Admin CRM static checks passed")
