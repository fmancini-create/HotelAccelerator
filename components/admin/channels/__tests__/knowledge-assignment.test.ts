import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

const CHANNELS_PAGE = "app/admin/channels/page.tsx"
const PANEL = "components/admin/channels/channel-knowledge-assignment.tsx"
const ASSIGNMENT = "components/admin/knowledge/channel-bases-assignment.tsx"
const CHANNEL_API = "app/api/admin/ai/channels/route.ts"
const KNOWLEDGE = "lib/ai/knowledge-bases.ts"
const EMAIL_MIGRATION = "supabase/migrations/20260821204030_add_email_channel_knowledge_bases.sql"

describe("associazione delle basi nella sezione Canali", () => {
  it("rende il pannello direttamente nella pagina Canali", () => {
    const page = read(CHANNELS_PAGE)
    expect(page).toContain('id="basi-conoscenza"')
    expect(page).toContain("<ChannelKnowledgeAssignment />")
    expect(page.indexOf('category.id === "messaging"')).toBeLessThan(page.indexOf('id="basi-conoscenza"'))
    expect(page.indexOf('id="basi-conoscenza"')).toBeLessThan(page.indexOf("{/* Help Section */}"))
  })

  it("carica in parallelo canali e basi del tenant autenticato", () => {
    const panel = read(PANEL)
    expect(panel).toContain("Promise.all")
    expect(panel).toContain('fetch("/api/admin/ai/channels"')
    expect(panel).toContain('fetch("/api/admin/ai/knowledge-bases"')
    expect(panel).toContain('credentials: "include"')
  })

  it("spiega dove si configurano Chat e Telefono", () => {
    const panel = read(PANEL)
    expect(panel).toMatch(/Per Chat e Telefono la base si sceglie/i)
  })

  it("non dichiara che tutte le basi sono collegate quando non ne esiste nessuna", () => {
    const assignment = read(ASSIGNMENT)
    expect(assignment).toContain("bases.length === 0")
    expect(assignment).toContain("Prima crea almeno una base di conoscenza")
  })

  it("include le caselle email reali nell'elenco e salva il tipo di sorgente", () => {
    const api = read(CHANNEL_API)
    const knowledge = read(KNOWLEDGE)
    const assignment = read(ASSIGNMENT)

    expect(api).toContain("requireTenantAdmin(request)")
    expect(api).toContain("getKnowledgeChannels(propertyId)")
    expect(knowledge).toContain('.from("email_channels")')
    expect(knowledge).toContain('.from("email_channel_knowledge_bases")')
    expect(assignment).toContain("channelSource: channel.source")
  })

  it("mantiene una relazione email con foreign key e scrittura atomica tenant-aware", () => {
    const migration = read(EMAIL_MIGRATION)
    expect(migration).toContain("references public.email_channels(id) on delete cascade")
    expect(migration).toContain("references public.knowledge_bases(id) on delete cascade")
    expect(migration).toContain("security invoker")
    expect(migration).toContain("property_id = p_property_id")
    expect(migration).toContain("set_email_channel_knowledge_bases")
  })
})
