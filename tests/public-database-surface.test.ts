import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

function source(path: string) {
  return readFileSync(join(root, path), "utf8")
}

describe("public database surface", () => {
  it.each([
    "lib/tenant-resolver.ts",
    "lib/get-tenant.ts",
    "app/p/[...pageSlug]/page.tsx",
  ])("resolves public property metadata with a server-only client in %s", (path) => {
    const file = source(path)

    expect(file).toContain("createServiceClient")
    expect(file).toContain('.from("public_properties")')
  })

  it("keeps the browser client away from public_properties", () => {
    const browserClient = source("lib/supabase/client.ts")

    expect(browserClient).not.toContain("public_properties")
  })

  it("reads public CMS publications with a server-only client scoped to the tenant", () => {
    const file = source("app/site/[[...slug]]/page.tsx")

    expect(file).toContain("createServiceClient")
    expect(file).not.toContain("createClient()")
    expect(file).toContain('.from("public_cms_publications")')
    expect(file).toContain('.eq("property_id", tenant.id)')
  })
})
