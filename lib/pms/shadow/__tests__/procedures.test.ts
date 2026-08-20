import { describe, it, expect } from "vitest"
import {
  chiaveProcedura,
  classificaRischio,
  decidiStato,
  proponiTitolo,
  SOGLIA_AUTONOMIA_PREDEFINITA,
  type ShadowStep,
} from "@/lib/pms/shadow/procedures"

/**
 * Le sequenze qui sotto non sono inventate a caso: ricalcano i gesti veri di uno
 * sportello (apri l'elenco arrivi, apri una scheda, compila una data, salva) e i
 * gesti che NON devono mai diventare automatici (un rimborso, una
 * cancellazione).
 */

const apriArrivi: ShadowStep[] = [
  { action: "navigate", urlPath: "/prenotazioni/arrivi" },
  { action: "click", targetRole: "link", targetLabel: "Arrivi di oggi", urlPath: "/prenotazioni/arrivi" },
]

const registraCheckIn: ShadowStep[] = [
  { action: "navigate", urlPath: "/prenotazioni/arrivi" },
  { action: "click", targetRole: "link", targetLabel: "Rossi Mario", urlPath: "/prenotazioni/arrivi" },
  { action: "fill", targetRole: "textbox", targetLabel: "Documento", urlPath: "/prenotazioni/scheda", valueKind: "text" },
  { action: "fill", targetRole: "textbox", targetLabel: "Data di nascita", urlPath: "/prenotazioni/scheda", valueKind: "date" },
  { action: "submit", targetRole: "button", targetLabel: "Salva", urlPath: "/prenotazioni/scheda" },
]

const emettiRimborso: ShadowStep[] = [
  { action: "navigate", urlPath: "/cassa" },
  { action: "click", targetRole: "button", targetLabel: "Rimborso", urlPath: "/cassa" },
  { action: "fill", targetRole: "textbox", targetLabel: "Importo", urlPath: "/cassa", valueKind: "money" },
  { action: "submit", targetRole: "button", targetLabel: "Conferma", urlPath: "/cassa" },
]

describe("chiaveProcedura", () => {
  it("riconosce la stessa procedura scritta con maiuscole o accenti diversi", () => {
    const a: ShadowStep[] = [{ action: "click", targetRole: "button", targetLabel: "Salva" }]
    const b: ShadowStep[] = [{ action: "click", targetRole: "button", targetLabel: "SALVA!" }]
    expect(chiaveProcedura(a)).toBe(chiaveProcedura(b))
  })

  it("distingue due percorsi che differiscono solo dopo una barra", () => {
    // Questo e' il motivo per cui il percorso non passa dal normalizzatore delle
    // domande: quello mangia le barre e queste due pagine diventerebbero la
    // stessa procedura.
    const a: ShadowStep[] = [{ action: "navigate", urlPath: "/prenotazioni/nuova" }]
    const b: ShadowStep[] = [{ action: "navigate", urlPath: "/prenotazioni/nuovo-ospite" }]
    expect(chiaveProcedura(a)).not.toBe(chiaveProcedura(b))
  })

  it("distingue due sequenze con gli stessi passi in ordine diverso", () => {
    const invertita = [registraCheckIn[1], registraCheckIn[0], ...registraCheckIn.slice(2)]
    expect(chiaveProcedura(registraCheckIn)).not.toBe(chiaveProcedura(invertita))
  })

  it("da' sempre la stessa chiave per la stessa sequenza", () => {
    expect(chiaveProcedura(registraCheckIn)).toBe(chiaveProcedura(registraCheckIn))
  })

  it("non cambia se cambia il contenuto digitato, solo la sua natura", () => {
    // Il tipo ShadowStep non ha un campo per il valore: questa prova difende
    // quella scelta. Due check-in con documenti diversi sono la stessa
    // procedura, ed e' per questo che il valore non serve.
    const conNatura: ShadowStep[] = [
      { action: "fill", targetLabel: "Documento", valueKind: "text" },
    ]
    const conAltraNatura: ShadowStep[] = [
      { action: "fill", targetLabel: "Documento", valueKind: "number" },
    ]
    expect(chiaveProcedura(conNatura)).not.toBe(chiaveProcedura(conAltraNatura))
  })
})

describe("classificaRischio", () => {
  it("guardare senza scrivere e' rischio basso", () => {
    expect(classificaRischio(apriArrivi)).toBe("basso")
  })

  it("scrivere nel PMS e' rischio medio", () => {
    expect(classificaRischio(registraCheckIn)).toBe("medio")
  })

  it("un rimborso e' rischio alto", () => {
    expect(classificaRischio(emettiRimborso)).toBe("alto")
  })

  it("un campo di tipo importo alza il rischio anche senza parole sospette", () => {
    // Il PMS potrebbe chiamare il campo "Totale" o "Val.": la parola non aiuta,
    // la natura del campo si'.
    const senzaParoleSospette: ShadowStep[] = [
      { action: "navigate", urlPath: "/scheda" },
      { action: "fill", targetLabel: "Totale", urlPath: "/scheda", valueKind: "money" },
    ]
    expect(classificaRischio(senzaParoleSospette)).toBe("alto")
  })

  it("riconosce la parola anche dentro il percorso della pagina", () => {
    const soloPercorso: ShadowStep[] = [{ action: "navigate", urlPath: "/cassa/storno" }]
    expect(classificaRischio(soloPercorso)).toBe("alto")
  })
})

describe("decidiStato", () => {
  const soglia = SOGLIA_AUTONOMIA_PREDEFINITA

  it("sotto la soglia resta soltanto osservata", () => {
    expect(decidiStato({ occorrenze: soglia - 1, soglia, rischio: "basso" })).toBe("osservata")
  })

  it("il rischio basso diventa autonomo alla soglia", () => {
    expect(decidiStato({ occorrenze: soglia, soglia, rischio: "basso" })).toBe("autonoma")
  })

  it("il rischio medio alla soglia diventa una proposta, non un'azione", () => {
    expect(decidiStato({ occorrenze: soglia, soglia, rischio: "medio" })).toBe("proposta")
  })

  it("il rischio alto non diventa autonomo nemmeno visto cento volte", () => {
    expect(decidiStato({ occorrenze: 100, soglia, rischio: "alto" })).toBe("proposta")
  })

  it("una decisione umana di bloccare non si annulla con le ripetizioni", () => {
    expect(
      decidiStato({ occorrenze: 100, soglia, rischio: "basso", attuale: "bloccata" }),
    ).toBe("bloccata")
  })

  it("una procedura sbloccata da una persona resta autonoma", () => {
    expect(
      decidiStato({ occorrenze: soglia, soglia, rischio: "medio", attuale: "autonoma" }),
    ).toBe("autonoma")
  })

  it("se il rischio si alza, una procedura autonoma torna a chiedere", () => {
    // Il PMS cambia e la stessa sequenza inizia a toccare un importo: la
    // sicurezza vince sull'abitudine.
    expect(
      decidiStato({ occorrenze: 100, soglia, rischio: "alto", attuale: "autonoma" }),
    ).toBe("proposta")
  })
})

describe("proponiTitolo", () => {
  it("usa l'ultimo gesto conclusivo, che e' quello che da' il senso", () => {
    expect(proponiTitolo(registraCheckIn)).toBe("Salva — 5 passi")
  })

  it("ripiega sul percorso quando non c'e' nessuna etichetta", () => {
    expect(proponiTitolo([{ action: "navigate", urlPath: "/arrivi" }])).toBe("arrivi — 1 passo")
  })
})
