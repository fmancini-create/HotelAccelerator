/**
 * Le sezioni di piattaforma non devono mai comparire nel menu di un albergatore.
 *
 * PERCHE' QUESTA PROVA ESISTE. Le voci mostrano l'elenco di TUTTI i clienti, il
 * fatturato complessivo e i costi dei moduli. Marcarle `adminOnly` sarebbe
 * bastato a farle vedere a ogni amministratore di struttura, cioe' a far vedere
 * a un cliente i dati dei concorrenti. La differenza sta in una riga e
 * nell'ORDINE in cui viene letta, quindi va presidiata.
 */

import { describe, expect, it } from "vitest"
import {
  NAV_ENTRIES,
  OPERATIVE_ENTRIES,
  PLATFORM_ENTRIES,
  SETTINGS_ENTRIES,
  visibleEntries,
} from "../nav"

describe("sezioni di piattaforma nel menu unico", () => {
  it("un amministratore di STRUTTURA non ne vede nessuna", () => {
    /*
     * Il caso che conta davvero: `isAdmin` e' vero anche per l'albergatore, ed
     * esiste una scorciatoia `if (isAdmin) return true` che chiude il filtro.
     * Se il controllo di piattaforma stesse DOPO quella riga, qui passerebbero
     * tutte e sette.
     */
    const viste = visibleEntries(PLATFORM_ENTRIES, { isAdmin: true, areas: [], canManageUsers: true })
    expect(viste.map((v) => v.label), "un albergatore vedrebbe i dati dei concorrenti").toEqual([])
  })

  it("chi amministra la piattaforma le vede tutte", () => {
    // Controprova: senza questa, nascondere tutto a tutti passerebbe la prova
    // qui sopra e la funzione sembrerebbe corretta mentre non mostra nulla.
    const viste = visibleEntries(PLATFORM_ENTRIES, { isAdmin: true, isPlatformAdmin: true })
    expect(viste).toHaveLength(PLATFORM_ENTRIES.length)
    expect(PLATFORM_ENTRIES.length, "l'elenco di piattaforma non puo' essere vuoto").toBeGreaterThan(0)
  })

  it("con il ruolo ancora ignoto restano nascoste (fail-closed)", () => {
    // Mentre /api/platform/me sta rispondendo non si sa chi guarda. Nel dubbio
    // non si mostrano i dati di tutti i clienti.
    expect(visibleEntries(PLATFORM_ENTRIES, {})).toEqual([])
    expect(visibleEntries(PLATFORM_ENTRIES, { isAdmin: undefined })).toEqual([])
  })

  it("un membro senza poteri non ne vede nessuna", () => {
    const viste = visibleEntries(PLATFORM_ENTRIES, { isAdmin: false, areas: ["crm", "inbox"] })
    expect(viste).toEqual([])
  })

  it("ogni voce di piattaforma e' marcata platformOnly", () => {
    /*
     * Difende dalla dimenticanza piu' probabile: si aggiunge una voce nuova
     * copiando quella sopra e si scorda il flag. Senza flag la voce eredita le
     * regole normali e finisce nel menu di tutti gli amministratori.
     */
    const senzaFlag = PLATFORM_ENTRIES.filter((e) => !e.platformOnly)
    expect(senzaFlag.map((e) => e.id), "voci di piattaforma senza platformOnly").toEqual([])
  })

  it("nessuna voce di piattaforma finisce negli elenchi della struttura", () => {
    const idsPiattaforma = new Set(PLATFORM_ENTRIES.map((e) => e.id))
    const intruse = [...OPERATIVE_ENTRIES, ...SETTINGS_ENTRIES].filter((e) => idsPiattaforma.has(e.id))
    expect(intruse.map((e) => e.id)).toEqual([])
  })

  it("le voci di piattaforma puntano a /super-admin, le altre no", () => {
    /*
     * Accostamento fra due cose che devono restare coerenti: un indirizzo
     * /super-admin/* raggiunto da una voce NON marcata sarebbe una porta aperta
     * sull'area sbagliata.
     */
    for (const e of NAV_ENTRIES) {
      if (e.href.startsWith("/super-admin")) {
        expect(e.platformOnly, `${e.id} punta a ${e.href} ma non e' platformOnly`).toBe(true)
      }
      if (e.platformOnly) {
        expect(e.href, `${e.id} e' platformOnly ma non punta a /super-admin`).toMatch(/^\/super-admin/)
      }
    }
  })

  it("include le due pagine che prima erano irraggiungibili", () => {
    /*
     * Il menu scritto a mano in app/super-admin/layout.tsx dichiarava 5 voci
     * mentre le pagine su disco erano 7: "Costi moduli" e "Nuovo cliente" si
     * raggiungevano solo scrivendo l'indirizzo a mano. Sono il motivo per cui
     * un elenco unico serve, quindi la loro presenza va presidiata.
     */
    const indirizzi = PLATFORM_ENTRIES.map((e) => e.href)
    expect(indirizzi).toContain("/super-admin/module-costs")
    expect(indirizzi).toContain("/super-admin/onboarding")
  })
})
