import { describe, expect, it } from "vitest"
import { buildSearchSnippet } from "../search-snippet"

describe("buildSearchSnippet", () => {
  it("centres an exact body match and highlights it", () => {
    const content = `${"inizio ".repeat(45)}La prenotazione e stata cancellata su richiesta del cliente.${" fine".repeat(45)}`
    const result = buildSearchSnippet(content, "cancellata", [], 120)

    expect(result).not.toBeNull()
    expect(result?.text.toLowerCase()).toContain("cancellata")
    expect(result?.text.startsWith("…")).toBe(true)
    expect(result?.highlights.length).toBeGreaterThan(0)

    const highlighted = result!.text.slice(result!.highlights[0].start, result!.highlights[0].end)
    expect(highlighted.toLowerCase()).toBe("cancellata")
  })

  it("strips email HTML before creating the snippet", () => {
    const result = buildSearchSnippet(
      '<html><head><style>.x{color:red}</style></head><body><p>Richiesta late check-out per domani</p></body></html>',
      "late check-out",
    )

    expect(result?.text).toContain("Richiesta late check-out per domani")
    expect(result?.text).not.toContain("<html>")
    expect(result?.text).not.toContain("color:red")
  })

  it("can highlight the corrected word when the query contains a typo", () => {
    const result = buildSearchSnippet(
      "Il listino e stato aggiornato questa mattina e inviato alla reception.",
      "agiornato",
    )

    expect(result).not.toBeNull()
    expect(result?.highlights.length).toBeGreaterThan(0)
    const highlighted = result!.text.slice(result!.highlights[0].start, result!.highlights[0].end)
    expect(highlighted.toLowerCase()).toBe("aggiornato")
  })

  it("can highlight an AI-expanded equivalent phrase", () => {
    const result = buildSearchSnippet(
      "Il cliente chiede la cancellazione della prenotazione senza penale.",
      "vuole disdire",
      ["cancellazione prenotazione"],
    )

    expect(result?.text).toContain("cancellazione")
    expect(result?.highlights.length).toBeGreaterThan(0)
  })
})
