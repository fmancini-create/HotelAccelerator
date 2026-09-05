import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const migration = readFileSync(
  new URL("../supabase/migrations/20260905162733_sync_hr_users_with_tenant_accounts.sql", import.meta.url),
  "utf8",
)

describe("HR tenant user provisioning migration", () => {
  it("provisions every tenant account instead of only tenant admins", () => {
    expect(migration).toContain("create or replace function public.hr_sync_admin_user_employee")
    expect(migration).toContain("where a.property_id = p_property_id")
    expect(migration).not.toContain("a.is_tenant_admin = true")
  })

  it("runs only when HR is effectively active", () => {
    expect(migration).toContain("tm.status in ('active', 'trial')")
    expect(migration).toContain("tm.expires_at is null or tm.expires_at >= now()")
  })

  it("links an unambiguous existing employee by tenant and email before inserting", () => {
    expect(migration).toContain("e.property_id = v_admin.property_id")
    expect(migration).toContain("e.admin_user_id is null")
    expect(migration).toContain("lower(trim(e.email)) = lower(trim(v_admin.email))")
    expect(migration).toContain("if v_email_match_count = 1")
  })

  it("preserves the individual time-clock flag", () => {
    expect(migration).not.toContain("requires_time_clock")
    expect(migration).toContain("on conflict (property_id, admin_user_id) do update")
  })
})
