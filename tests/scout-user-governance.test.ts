import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), "utf8")

describe("Scout user governance", () => {
  it("stores tenant-scoped access, assignments and usage events", () => {
    const migration = source("supabase/migrations/20260905235000_add_scout_user_access_assignment_usage.sql")

    expect(migration).toContain("crm_scout_user_access")
    expect(migration).toContain("primary key (property_id, user_id)")
    expect(migration).toContain("assigned_to_user_id")
    expect(migration).toContain("assigned_by_user_id")
    expect(migration).toContain("crm_scout_usage_events")
    expect(migration).toContain("credits_used")
    expect(migration).toContain("auth_property_id()")
  })

  it("requires individual Scout permission before using the provider", () => {
    const route = source("app/api/admin/crm/scout/route.ts")
    const access = source("lib/crm/scout-access.ts")
    const layout = source("app/admin/crm/intelligence/scout/layout.tsx")

    expect(route).toContain("requireScoutAccess")
    expect(route).toContain("recordScoutUsage")
    expect(access).toContain("crm_scout_user_access")
    expect(access).toContain("isGroupLead")
    expect(access).toContain("enabled && (isAdmin || lead)")
    expect(layout).toContain("ScoutAccessGate")
  })

  it("lets only enabled admins or group leads distribute prospects", () => {
    const access = source("lib/crm/scout-access.ts")
    const teamRoute = source("app/api/admin/crm/scout/team/route.ts")
    const assignmentPanel = source("components/crm/scout-assignment-panel.tsx")

    expect(access).toContain("listScoutAssignableUsers")
    expect(access).toContain("ledGroupMemberIds")
    expect(teamRoute).toContain("assertScoutAssignmentAllowed")
    expect(teamRoute).toContain("Questo prospect è gestito da un altro gruppo")
    expect(assignmentPanel).toContain("Distribuzione prospect Scout")
    expect(assignmentPanel).toContain("assigned_to_user_id")
  })

  it("keeps assigned work available even when the assignee cannot use Scout", () => {
    const assignedRoute = source("app/api/admin/crm/scout/assigned/route.ts")
    const prospectingLayout = source("app/admin/crm/prospecting/layout.tsx")
    const assignedPanel = source("components/crm/scout-assigned-work-panel.tsx")

    expect(assignedRoute).not.toContain("requireScoutAccess")
    expect(assignedRoute).toContain('eq("assigned_to_user_id", userId)')
    expect(prospectingLayout).toContain("ScoutAssignedWorkPanel")
    expect(assignedPanel).toContain("Non serve il permesso Scout")
    expect(assignedPanel).toContain('action: "start"')
  })

  it("exposes admin controls and per-user usage on the dashboard", () => {
    const usersLayout = source("app/admin/users/layout.tsx")
    const usersPanel = source("components/admin/scout-user-access-panel.tsx")
    const dashboard = source("app/admin/dashboard/page.tsx")
    const usagePanel = source("components/admin/dashboard/scout-usage-panel.tsx")
    const usageRoute = source("app/api/admin/crm/scout/usage/route.ts")

    expect(usersLayout).toContain("ScoutUserAccessPanel")
    expect(usersPanel).toContain("Permessi HotelAccelerator Scout")
    expect(usersPanel).toContain("scoutEnabled")
    expect(dashboard).toContain("ScoutUsagePanel")
    expect(usagePanel).toContain("Utilizzo HotelAccelerator Scout per utente")
    expect(usageRoute).toContain("crm_scout_usage_events")
    expect(usageRoute).toContain("assignedProspects")
  })
})
