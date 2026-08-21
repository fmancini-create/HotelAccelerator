import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

const CHANNELS_PAGE = "app/admin/channels/page.tsx"
const PANEL = "components/admin/channels/channel-knowledge-assignment.tsx"
const ASSIGNMENT = "components/admin/knowledge/channel-bases-assignment.tsx"

describe("associazione delle basi nella sezione Canali", () => {
  it("rende il pannello direttamente nella pagina Canali", () => {
    const page = read(CHANNELS_PAGE)
    expect(page).toContain('id="basi-conoscenza"')
    expect(page).toContain("<ChannelKnowledgeAssignment />")
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
})
