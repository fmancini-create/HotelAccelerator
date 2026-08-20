import { describe, it, expect } from "vitest"
import { puoVedereAreaDaResponsabile } from "../group-lead"

describe("chi vede un'area riservata ai responsabili", () => {
  it("l'amministratore la vede sempre", () => {
    expect(
      puoVedereAreaDaResponsabile({ isAdmin: true, isGroupLead: false, areaConcessa: false }),
    ).toBe(true)
  })

  it("il capogruppo con il permesso la vede", () => {
    expect(
      puoVedereAreaDaResponsabile({ isAdmin: false, isGroupLead: true, areaConcessa: true }),
    ).toBe(true)
  })

  it("essere capogruppo NON basta senza il permesso", () => {
    expect(
      puoVedereAreaDaResponsabile({ isAdmin: false, isGroupLead: true, areaConcessa: false }),
    ).toBe(false)
  })

  it("avere il permesso NON basta senza essere capogruppo", () => {
    // Questa e' la prova che conta: se le due condizioni fossero unite da una O
    // invece che da una E, concedere l'area a un membro qualsiasi gli aprirebbe
    // una pagina pensata per i responsabili. Concedere aree e' un'operazione di
    // tutti i giorni, quindi sarebbe successo davvero.
    expect(
      puoVedereAreaDaResponsabile({ isAdmin: false, isGroupLead: false, areaConcessa: true }),
    ).toBe(false)
  })

  it("un membro senza nulla non la vede", () => {
    expect(
      puoVedereAreaDaResponsabile({ isAdmin: false, isGroupLead: false, areaConcessa: false }),
    ).toBe(false)
  })

  it("il ruolo di amministratore ha la precedenza su entrambe le condizioni", () => {
    // Un amministratore non deve dipendere da una concessione: se cosi' fosse,
    // togliendo per sbaglio l'area a tutti resterebbe senza accesso proprio chi
    // deve poter rimediare.
    for (const isGroupLead of [true, false]) {
      for (const areaConcessa of [true, false]) {
        expect(puoVedereAreaDaResponsabile({ isAdmin: true, isGroupLead, areaConcessa })).toBe(true)
      }
    }
  })
})
