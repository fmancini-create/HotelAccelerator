import { describe, expect, it } from "vitest"
import { interpretScoutSearch } from "../scout-search"

function search(overrides: Partial<Parameters<typeof interpretScoutSearch>[0]> = {}) {
  return interpretScoutSearch({
    keywords: "",
    titles: [],
    seniorities: ["owner", "founder", "c_suite", "director", "manager"],
    organizationLocations: ["Italia"],
    page: 1,
    perPage: 25,
    ...overrides,
  })
}

describe("interpretScoutSearch", () => {
  it("expands the nautical occupational-safety demo search", () => {
    const { providerInput } = search({
      keywords: "settore nautico",
      titles: ["responsabile della sicurezza"],
    })

    expect(providerInput.keywords.split(",")).toEqual(
      expect.arrayContaining(["maritime", "marine", "yachting", "shipbuilding"]),
    )
    expect(providerInput.titles).toEqual(
      expect.arrayContaining(["safety manager", "HSE manager", "QHSE manager", "RSPP"]),
    )
    expect(providerInput.titles).not.toContain("cyber security manager")
    expect(providerInput.seniorities).toEqual([])
    expect(providerInput.organizationLocations).toEqual(["Italy"])
  })

  it("keeps cybersecurity separate from workplace safety", () => {
    const { providerInput } = search({ titles: ["sicurezza informatica"] })

    expect(providerInput.titles).toEqual(
      expect.arrayContaining(["cyber security manager", "information security manager", "CISO"]),
    )
    expect(providerInput.titles).not.toContain("HSE manager")
  })

  it("preserves unknown industry and role terms", () => {
    const { providerInput } = search({
      keywords: "microbirrifici",
      titles: ["mastro birraio"],
      organizationLocations: ["Tuscany, Italy"],
    })

    expect(providerInput.keywords).toBe("microbirrifici")
    expect(providerInput.titles).toEqual(["mastro birraio"])
    expect(providerInput.organizationLocations).toEqual(["Tuscany, Italy"])
  })

  it("keeps seniority filters only when no explicit role is supplied", () => {
    const { providerInput } = search({ keywords: "hospitality", titles: [] })

    expect(providerInput.seniorities).toEqual(["owner", "founder", "c_suite", "director", "manager"])
  })
})
