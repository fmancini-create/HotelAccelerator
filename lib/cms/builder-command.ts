import type { CMSBuilderDocument } from "@/lib/cms/builder-document"

export type BuilderBreakpoint = "desktop" | "tablet" | "mobile"

export type BuilderCommand =
  | { action: "move-section"; source: string; target: string; position: "before" | "after" }
  | { action: "rename-section"; section: string; label: string }
  | { action: "set-section-color"; section: string; color: string }
  | { action: "hide-section"; section: string; breakpoint: BuilderBreakpoint; hidden: boolean }
  | { action: "add-element"; section: string; elementType: "heading" | "text" | "button" | "booking-widget"; content?: string }

export type ParsedBuilderCommand =
  | { ok: true; command: BuilderCommand; summary: string }
  | { ok: false; error: string }

const normalize = (value: string) => value.trim().toLocaleLowerCase("it-IT")

function findSection(document: CMSBuilderDocument, query: string) {
  const wanted = normalize(query)
  return document.pages[0]?.sections.find((section) =>
    normalize(section.label) === wanted ||
    normalize(section.id) === wanted ||
    normalize(section.label).includes(wanted) ||
    wanted.includes(normalize(section.label)),
  )
}

function parseBreakpoint(value?: string): BuilderBreakpoint {
  const normalized = normalize(value || "desktop")
  if (normalized.includes("mobile") || normalized.includes("telefono")) return "mobile"
  if (normalized.includes("tablet")) return "tablet"
  return "desktop"
}

export function parseBuilderCommand(input: string, document: CMSBuilderDocument): ParsedBuilderCommand {
  const text = input.trim()
  if (!text) return { ok: false, error: "Scrivi o pronuncia un comando." }

  let match = text.match(/(?:sposta|porta) (?:la )?sezione (.+?) (prima|dopo|sopra|sotto) (?:la )?sezione (.+)$/i)
  if (match) {
    const source = findSection(document, match[1])
    const target = findSection(document, match[3])
    if (!source || !target) return { ok: false, error: "Non riconosco una delle due sezioni indicate." }
    const position = /prima|sopra/i.test(match[2]) ? "before" : "after"
    return { ok: true, command: { action: "move-section", source: source.id, target: target.id, position }, summary: `Sposta “${source.label}” ${position === "before" ? "prima" : "dopo"} “${target.label}”.` }
  }

  match = text.match(/(?:rinomina|chiama) (?:la )?sezione (.+?) (?:in|come) [“\"]?(.+?)[”\"]?$/i)
  if (match) {
    const section = findSection(document, match[1])
    if (!section) return { ok: false, error: "Non riconosco la sezione da rinominare." }
    return { ok: true, command: { action: "rename-section", section: section.id, label: match[2].trim() }, summary: `Rinomina “${section.label}” in “${match[2].trim()}”.` }
  }

  match = text.match(/(?:imposta|cambia|metti) (?:lo )?sfondo (?:della )?sezione (.+?) (?:a|in|su) (#[0-9a-f]{6})$/i)
  if (match) {
    const section = findSection(document, match[1])
    if (!section) return { ok: false, error: "Non riconosco la sezione indicata." }
    return { ok: true, command: { action: "set-section-color", section: section.id, color: match[2].toUpperCase() }, summary: `Imposta lo sfondo di “${section.label}” su ${match[2].toUpperCase()}.` }
  }

  match = text.match(/(nascondi|mostra) (?:la )?sezione (.+?)(?: su (desktop|tablet|mobile|telefono))?$/i)
  if (match) {
    const section = findSection(document, match[2])
    if (!section) return { ok: false, error: "Non riconosco la sezione indicata." }
    const breakpoint = parseBreakpoint(match[3])
    const hidden = normalize(match[1]) === "nascondi"
    return { ok: true, command: { action: "hide-section", section: section.id, breakpoint, hidden }, summary: `${hidden ? "Nascondi" : "Mostra"} “${section.label}” su ${breakpoint}.` }
  }

  match = text.match(/aggiungi (?:un |una )?(titolo|testo|pulsante|booking widget)(?: con (?:testo|etichetta) [“\"]?(.+?)[”\"]?)? (?:alla|nella) sezione (.+)$/i)
  if (match) {
    const section = findSection(document, match[3])
    if (!section) return { ok: false, error: "Non riconosco la sezione indicata." }
    const typeMap = { titolo: "heading", testo: "text", pulsante: "button", "booking widget": "booking-widget" } as const
    const elementType = typeMap[normalize(match[1]) as keyof typeof typeMap]
    return { ok: true, command: { action: "add-element", section: section.id, elementType, content: match[2]?.trim() }, summary: `Aggiungi ${match[1]} alla sezione “${section.label}”.` }
  }

  return { ok: false, error: "Comando non riconosciuto. Prova: “Sposta la sezione Camere prima della sezione Prenotazione”." }
}

export function applyBuilderCommand(document: CMSBuilderDocument, command: BuilderCommand): CMSBuilderDocument {
  const next = structuredClone(document)
  const sections = next.pages[0]?.sections || []

  if (command.action === "move-section") {
    const from = sections.findIndex((section) => section.id === command.source)
    const target = sections.findIndex((section) => section.id === command.target)
    if (from < 0 || target < 0 || from === target) return next
    const [moved] = sections.splice(from, 1)
    const targetAfterRemoval = sections.findIndex((section) => section.id === command.target)
    sections.splice(command.position === "before" ? targetAfterRemoval : targetAfterRemoval + 1, 0, moved)
  }

  if (command.action === "rename-section") {
    const section = sections.find((item) => item.id === command.section)
    if (section) section.label = command.label
  }

  if (command.action === "set-section-color") {
    const section = sections.find((item) => item.id === command.section)
    if (section) section.background.color = command.color
  }

  if (command.action === "hide-section") {
    const section = sections.find((item) => item.id === command.section)
    if (section) {
      section.elements.forEach((element) => { element.placement[command.breakpoint].hidden = command.hidden })
    }
  }

  if (command.action === "add-element") {
    const section = sections.find((item) => item.id === command.section)
    if (!section) return next
    const id = `${command.elementType}-${Date.now()}`
    const order = section.elements.length
    const placement = {
      desktop: { order, columnStart: 1, columnSpan: 12, align: "stretch" as const, hidden: false },
      tablet: { order, columnStart: 1, columnSpan: 8, align: "stretch" as const, hidden: false },
      mobile: { order, columnStart: 1, columnSpan: 4, align: "stretch" as const, hidden: false },
    }
    if (command.elementType === "heading") section.elements.push({ id, type: "heading", content: command.content || "Nuovo titolo", level: "h2", textAlign: "left", placement, locked: false })
    if (command.elementType === "text") section.elements.push({ id, type: "text", content: command.content || "Nuovo testo", textAlign: "left", placement, locked: false })
    if (command.elementType === "button") section.elements.push({ id, type: "button", label: command.content || "Scopri di più", href: "#", variant: "primary", openInNewTab: false, placement, locked: false })
    if (command.elementType === "booking-widget") section.elements.push({ id, type: "booking-widget", label: command.content || "Prenota", mode: "button", placement, locked: false })
  }

  return next
}
