import { describe, expect, it, vi, beforeEach } from "vitest"

/**
 * L'area "pms_learning" non si apre con la sola concessione: chi la riceve deve
 * anche essere responsabile (capogruppo) di un gruppo DI QUESTA struttura.
 *
 * Si prova la funzione vera (`getMemberEffectiveAreas`), non una copia della
 * regola: e' lei che alimenta il menu e le guardie, e una prova che riscrivesse
 * la logica resterebbe verde anche con la funzione rotta.
 */

type Riga = Record<string, unknown>

/** Risposte per tabella, con memoria di come sono state interrogate. */
let riposte: Record<string, Riga[]>
let errorePerTabella: Record<string, boolean>
let filtriVisti: Array<{ tabella: string; colonna: string; valore: unknown }>

function creaClientFinto() {
  const builder = (tabella: string) => {
    const stato = {
      eq(colonna: string, valore: unknown) {
        filtriVisti.push({ tabella, colonna, valore })
        return stato
      },
      in(colonna: string, valore: unknown) {
        filtriVisti.push({ tabella, colonna, valore })
        return stato
      },
      limit() {
        return stato
      },
      select() {
        return stato
      },
      then(risolvi: (r: { data: Riga[] | null; error: unknown }) => unknown) {
        const errore = errorePerTabella[tabella] ? { message: "guasto in lettura" } : null
        return Promise.resolve(risolvi({ data: errore ? null : (riposte[tabella] ?? []), error: errore }))
      },
    }
    return stato
  }
  return { from: (tabella: string) => builder(tabella) }
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => creaClientFinto(),
}))

// Import statico e non `await import`: vitest issa `vi.mock` sopra gli import,
// quindi il finto e' gia' registrato. Con `await import` la prova girava, ma
// `tsc` la rifiutava (await di primo livello) e il typecheck non deve peggiorare.
import { getMemberEffectiveAreas } from "../area-access"

const STRUTTURA = "prop-1"
const PERSONA = "user-1"

beforeEach(() => {
  riposte = {}
  errorePerTabella = {}
  filtriVisti = []
})

describe("pms_learning: concessione E ruolo di responsabile", () => {
  it("capogruppo di questa struttura CON la concessione: entra", async () => {
    riposte = {
      user_area_permissions: [{ area_key: "pms_learning" }],
      user_group_members: [{ group_id: "g1", is_lead: true }],
      group_area_permissions: [],
      user_groups: [{ id: "g1" }],
    }
    const aree = await getMemberEffectiveAreas(STRUTTURA, PERSONA)
    expect(aree).toContain("pms_learning")
  })

  it("SENZA la concessione, anche se capogruppo: non entra", async () => {
    riposte = {
      user_area_permissions: [],
      user_group_members: [{ group_id: "g1", is_lead: true }],
      group_area_permissions: [],
      user_groups: [{ id: "g1" }],
    }
    const aree = await getMemberEffectiveAreas(STRUTTURA, PERSONA)
    expect(aree).not.toContain("pms_learning")
  })

  it("CON la concessione ma semplice membro: non entra", async () => {
    riposte = {
      user_area_permissions: [{ area_key: "pms_learning" }],
      user_group_members: [{ group_id: "g1", is_lead: false }],
      group_area_permissions: [],
      user_groups: [],
    }
    const aree = await getMemberEffectiveAreas(STRUTTURA, PERSONA)
    expect(aree).not.toContain("pms_learning")
  })

  it("capogruppo in un'ALTRA struttura: non entra qui", async () => {
    riposte = {
      user_area_permissions: [{ area_key: "pms_learning" }],
      user_group_members: [{ group_id: "g-altrove", is_lead: true }],
      group_area_permissions: [],
      // La struttura non ha quel gruppo: la lettura filtrata torna vuota.
      user_groups: [],
    }
    const aree = await getMemberEffectiveAreas(STRUTTURA, PERSONA)
    expect(aree).not.toContain("pms_learning")
  })

  it("il gruppo viene cercato dentro QUESTA struttura", async () => {
    riposte = {
      user_area_permissions: [{ area_key: "pms_learning" }],
      user_group_members: [{ group_id: "g1", is_lead: true }],
      group_area_permissions: [],
      user_groups: [{ id: "g1" }],
    }
    await getMemberEffectiveAreas(STRUTTURA, PERSONA)
    // Senza questo filtro, essere responsabile altrove aprirebbe l'area qui.
    expect(filtriVisti).toEqual(
      expect.arrayContaining([{ tabella: "user_groups", colonna: "property_id", valore: STRUTTURA }]),
    )
  })

  it("se la lettura dei gruppi va in errore: si NEGA", async () => {
    riposte = {
      user_area_permissions: [{ area_key: "pms_learning" }],
      user_group_members: [{ group_id: "g1", is_lead: true }],
      group_area_permissions: [],
      user_groups: [{ id: "g1" }],
    }
    errorePerTabella = { user_groups: true }
    const aree = await getMemberEffectiveAreas(STRUTTURA, PERSONA)
    // Non sapere non deve aprire il registro di come lavora il personale.
    expect(aree).not.toContain("pms_learning")
  })

  it("le altre aree concesse non vengono toccate dal filtro", async () => {
    riposte = {
      user_area_permissions: [{ area_key: "pms_learning" }, { area_key: "crm" }],
      user_group_members: [{ group_id: "g1", is_lead: false }],
      group_area_permissions: [],
      user_groups: [],
    }
    const aree = await getMemberEffectiveAreas(STRUTTURA, PERSONA)
    expect(aree).not.toContain("pms_learning")
    // Il filtro deve sottrarre SOLO l'area riservata, non fare terra bruciata.
    expect(aree).toContain("crm")
  })
})
