import { describe, expect, it } from "vitest"
import {
  TEMPI_DISCONNESSIONE,
  etichettaTempo,
  risolviTempoDisconnessione,
  secondiPreavviso,
  tempoAmmesso,
} from "@/lib/auth/auto-logout"

describe("tempi offerti", () => {
  it("offre esattamente i tempi chiesti", () => {
    expect([...TEMPI_DISCONNESSIONE]).toEqual([1, 5, 10, 15, 30])
  })

  it("non ammette lo zero: disconnetterebbe la persona nell'istante in cui entra", () => {
    expect(tempoAmmesso(0)).toBe(false)
  })

  it("non ammette valori fuori dall'elenco, anche se il database li accetterebbe", () => {
    // Il vincolo del database accetta 1..480: 7 e 60 ci stanno dentro. Ma se una
    // rotta li accettasse, l'elenco mostrato non conterrebbe il valore salvato e
    // la casella apparirebbe VUOTA pur avendo un tempo attivo.
    expect(tempoAmmesso(7)).toBe(false)
    expect(tempoAmmesso(60)).toBe(false)
    expect(tempoAmmesso(-5)).toBe(false)
    expect(tempoAmmesso("15")).toBe(false)
    expect(tempoAmmesso(null)).toBe(false)
    expect(tempoAmmesso(undefined)).toBe(false)
  })

  it("scrive il singolare per un minuto", () => {
    expect(etichettaTempo(1)).toBe("1 minuto")
    expect(etichettaTempo(30)).toBe("30 minuti")
  })
})

describe("da chi viene il tempo", () => {
  it("senza nessuna scelta non disconnette nessuno", () => {
    // Installare la funzione non deve cambiare il comportamento di chi non l'ha
    // chiesta.
    const r = risolviTempoDisconnessione({ valoreUtente: null, gruppi: [] })
    expect(r.minuti).toBeNull()
    expect(r.origine).toBe("predefinito")
  })

  it("senza scelta e senza gruppi passati non disconnette nessuno", () => {
    const r = risolviTempoDisconnessione({ valoreUtente: undefined })
    expect(r.minuti).toBeNull()
    expect(r.origine).toBe("predefinito")
  })

  it("la scelta sulla persona vince sui gruppi", () => {
    const r = risolviTempoDisconnessione({
      valoreUtente: 5,
      gruppi: [{ nome: "Front Office", minuti: 30 }],
    })
    expect(r.minuti).toBe(5)
    expect(r.origine).toBe("utente")
  })

  it("la scelta sulla persona vince ANCHE quando concede piu' tempo del gruppo", () => {
    // Serve a poter fare un'eccezione (es. il direttore) in un posto visibile,
    // invece di nasconderla togliendo la persona da un gruppo.
    const r = risolviTempoDisconnessione({
      valoreUtente: 30,
      gruppi: [{ nome: "Front Office", minuti: 1 }],
    })
    expect(r.minuti).toBe(30)
    expect(r.origine).toBe("utente")
  })

  it("senza scelta sulla persona segue il gruppo, e dice quale", () => {
    const r = risolviTempoDisconnessione({
      valoreUtente: null,
      gruppi: [{ nome: "Front Office", minuti: 10 }],
    })
    expect(r.minuti).toBe(10)
    expect(r.origine).toBe("gruppo")
    expect(r.nomeGruppo).toBe("Front Office")
  })

  it("ignora i gruppi che non hanno impostato nulla", () => {
    const r = risolviTempoDisconnessione({
      valoreUtente: null,
      gruppi: [
        { nome: "Pulizie", minuti: null },
        { nome: "Front Office", minuti: 15 },
        { nome: "Manutenzione", minuti: undefined },
      ],
    })
    expect(r.minuti).toBe(15)
    expect(r.nomeGruppo).toBe("Front Office")
  })
})

describe("piu' gruppi: vince il tempo piu' breve", () => {
  it("fra 5 e 30 minuti sceglie 5", () => {
    // LA PROVA CHE CONTA. Per i permessi vince il piu' permissivo (transfer.ts
    // usa `.some`), ma questa e' una protezione: "il piu' permissivo" vorrebbe
    // dire "il tempo piu' lungo", cioe' la protezione piu' debole.
    const r = risolviTempoDisconnessione({
      valoreUtente: null,
      gruppi: [
        { nome: "Amministrazione", minuti: 30 },
        { nome: "Front Office", minuti: 5 },
      ],
    })
    expect(r.minuti).toBe(5)
    expect(r.nomeGruppo).toBe("Front Office")
  })

  it("l'ordine dei gruppi non cambia il risultato", () => {
    const a = risolviTempoDisconnessione({
      valoreUtente: null,
      gruppi: [
        { nome: "Front Office", minuti: 5 },
        { nome: "Amministrazione", minuti: 30 },
      ],
    })
    expect(a.minuti).toBe(5)
    expect(a.nomeGruppo).toBe("Front Office")
  })

  it("aggiungere un gruppo non puo' INDEBOLIRE la protezione", () => {
    // Il difetto che questa regola evita: una persona aggiunta a un gruppo
    // qualsiasi con tempo lungo non deve perdere il tempo breve del suo reparto.
    const soloReparto = risolviTempoDisconnessione({
      valoreUtente: null,
      gruppi: [{ nome: "Front Office", minuti: 5 }],
    })
    const conGruppoInPiu = risolviTempoDisconnessione({
      valoreUtente: null,
      gruppi: [
        { nome: "Front Office", minuti: 5 },
        { nome: "Tutti", minuti: 30 },
      ],
    })
    expect(conGruppoInPiu.minuti).toBe(soloReparto.minuti)
    expect(conGruppoInPiu.minuti!).toBeLessThanOrEqual(soloReparto.minuti!)
  })
})

describe("preavviso", () => {
  it("non e' mai piu' lungo del tempo stesso", () => {
    // Con 60 secondi fissi su un tempo di 1 minuto l'avviso comparirebbe
    // nell'istante dell'accesso: la persona lo vedrebbe sempre.
    for (const m of TEMPI_DISCONNESSIONE) {
      expect(secondiPreavviso(m)).toBeLessThan(m * 60)
    }
  })

  it("lascia comunque il tempo di leggere", () => {
    for (const m of TEMPI_DISCONNESSIONE) {
      expect(secondiPreavviso(m)).toBeGreaterThanOrEqual(10)
    }
  })

  it("sui tempi lunghi non diventa interminabile", () => {
    expect(secondiPreavviso(1)).toBe(15)
    expect(secondiPreavviso(5)).toBe(60)
    expect(secondiPreavviso(30)).toBe(60)
  })
})
