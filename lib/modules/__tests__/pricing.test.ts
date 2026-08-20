import { describe, it, expect } from "vitest"
import {
  MOLTIPLICATORE_PREZZO,
  prezzoVenditaCentesimi,
  margineCentesimi,
  formattaImporto,
} from "../pricing"

describe("prezzo di vendita dei moduli a pagamento", () => {
  it("raddoppia il costo", () => {
    expect(prezzoVenditaCentesimi(5000)).toBe(10000)
    expect(prezzoVenditaCentesimi(12345)).toBe(24690)
  })

  it("il ricarico e' esattamente 2: meta' del prezzo e' margine", () => {
    expect(MOLTIPLICATORE_PREZZO).toBe(2)
    const costo = 7300
    expect(margineCentesimi(costo)).toBe(costo)
    expect(prezzoVenditaCentesimi(costo)).toBe(costo * 2)
  })

  it("costo non impostato NON diventa prezzo zero", () => {
    // Il punto della prova: 0 si leggerebbe "gratis". Deve restare "non lo so".
    expect(prezzoVenditaCentesimi(null)).toBeNull()
    expect(prezzoVenditaCentesimi(undefined)).toBeNull()
    expect(prezzoVenditaCentesimi(null)).not.toBe(0)
    expect(margineCentesimi(null)).toBeNull()
  })

  it("un costo di zero e' un prezzo di zero, ed e' diverso da non impostato", () => {
    expect(prezzoVenditaCentesimi(0)).toBe(0)
    expect(prezzoVenditaCentesimi(null)).toBeNull()
  })

  it("rifiuta valori impossibili invece di propagarli", () => {
    expect(prezzoVenditaCentesimi(-1)).toBeNull()
    expect(prezzoVenditaCentesimi(Number.NaN)).toBeNull()
    expect(prezzoVenditaCentesimi(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it("scrive gli importi in euro all'italiana", () => {
    // Lo spazio prima di EUR nella formattazione italiana non e' uno spazio
    // normale: si confronta sui numeri, non sul simbolo.
    expect(formattaImporto(10000)).toContain("100,00")
    expect(formattaImporto(2550)).toContain("25,50")
  })

  it("un importo non impostato si legge a parole, non come numero", () => {
    expect(formattaImporto(null)).toBe("non impostato")
    expect(formattaImporto(undefined)).toBe("non impostato")
    expect(formattaImporto(null)).not.toContain("0")
  })
})
