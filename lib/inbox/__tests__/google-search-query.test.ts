import { describe, expect, it } from "vitest"
import {
  hasAdvancedSearchSyntax,
  shouldEnableFuzzySearch,
  shouldTrySemanticExpansion,
} from "../google-search-query"

describe("Google-like Inbox search query decisions", () => {
  it("recognises web-search operators and preserves their semantics", () => {
    expect(hasAdvancedSearchSyntax('"camera superior"')).toBe(true)
    expect(hasAdvancedSearchSyntax("spa OR piscina")).toBe(true)
    expect(hasAdvancedSearchSyntax("prenotazione -booking")).toBe(true)
    expect(hasAdvancedSearchSyntax("cancellazione prenotazione")).toBe(false)
  })

  it("enables typo/prefix correction only for ordinary natural-language terms", () => {
    expect(shouldEnableFuzzySearch("agiornati")).toBe(true)
    expect(shouldEnableFuzzySearch("cancell")).toBe(true)
    expect(shouldEnableFuzzySearch('"cancellazione prenotazione"')).toBe(false)
    expect(shouldEnableFuzzySearch("spa OR piscina")).toBe(false)
    expect(shouldEnableFuzzySearch("guest@example.com")).toBe(false)
    expect(shouldEnableFuzzySearch("055 8290741")).toBe(false)
  })

  it("uses semantic expansion only when deterministic results are sparse or weak", () => {
    expect(shouldTrySemanticExpansion("vuole annullare la prenotazione", 1, 1)).toBe(true)
    expect(shouldTrySemanticExpansion("vuole annullare la prenotazione", 50, 1)).toBe(false)
    expect(shouldTrySemanticExpansion("annullamento", 50, 0.4)).toBe(true)
    expect(shouldTrySemanticExpansion("guest@example.com", 0, 0)).toBe(false)
    expect(shouldTrySemanticExpansion('"annullare prenotazione"', 0, 0)).toBe(false)
  })
})
