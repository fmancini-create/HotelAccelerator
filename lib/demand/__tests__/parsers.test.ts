import { describe, it, expect } from "vitest"
import { parseMyrestoo, parseScidoo, structuredSourceOf } from "../parsers"

/**
 * Gli oggetti e i corpi qui sotto sono copiati da email reali del tenant, non
 * inventati: i formati "plausibili" sono esattamente ciò che ha fatto passare
 * i difetti trovati durante la costruzione.
 */

describe("parseMyrestoo", () => {
  it("legge stato, giorno, ora, coperti e nome dall'oggetto", () => {
    const r = parseMyrestoo("Prenotazione CONFERMATA: mer, 19 ago. | 19:15 | 2 PAX | Noa Dagan", "2026-08-15T10:00:00Z")
    expect(r).not.toBeNull()
    expect(r!.referenceDate).toBe("2026-08-19")
    expect(r!.payload.coperti).toBe(2)
    expect(r!.payload.ora).toBe("19:15")
    expect(r!.payload.esito).toBe("confermata")
    expect(r!.payload.servizio).toBe("cena")
    expect(r!.payload.nome_cliente).toBe("Noa Dagan")
  })

  it("traduce gli stati della sorgente in esiti nostri", () => {
    const cancel = parseMyrestoo("Prenotazione CANCELLA: lun, 17 ago. | 19:45 | 2 PAX | Jlenia M.", "2026-08-15T10:00:00Z")
    expect(cancel!.payload.esito).toBe("annullata")

    const attesa = parseMyrestoo(
      "Prenotazione IN LISTA D'ATTESA: lun, 17 ago. | 19:45 | 4 PAX | Debora B.",
      "2026-08-15T10:00:00Z",
    )
    expect(attesa!.payload.esito).toBe("aperta")
    // Lo stato originale resta leggibile: "in lista d'attesa" non e' "aperta".
    expect(attesa!.payload.stato_sorgente).toBe("IN LISTA D'ATTESA")
  })

  it("deduce il pranzo dall'ora quando il servizio non e' scritto", () => {
    const r = parseMyrestoo("Prenotazione CONFERMATA: dom, 27 set. | 12:15 | 2 PAX | Francesca G.", "2026-08-14T09:00:00Z")
    expect(r!.payload.servizio).toBe("pranzo")
  })

  /**
   * L'anno non c'e' nell'oggetto. Senza deduzione una prenotazione di gennaio
   * notificata a dicembre finirebbe undici mesi INDIETRO, cioe' nel passato.
   */
  it("deduce l'anno successivo quando il giorno cade molto prima della notifica", () => {
    const r = parseMyrestoo("Prenotazione CONFERMATA: ven, 9 gen. | 20:00 | 4 PAX | Mario Rossi", "2026-12-20T18:00:00Z")
    expect(r!.referenceDate).toBe("2027-01-09")
  })

  it("resta nell'anno corrente per una data vicina", () => {
    const r = parseMyrestoo("Prenotazione CONFERMATA: sab, 16 ago. | 20:00 | 2 PAX | Tizio", "2026-08-15T10:00:00Z")
    expect(r!.referenceDate).toBe("2026-08-16")
  })

  it("non inventa nulla su un oggetto di altro tipo", () => {
    expect(parseMyrestoo("Fattura n. 45 del 2026", "2026-08-15T10:00:00Z")).toBeNull()
    expect(parseMyrestoo(null, "2026-08-15T10:00:00Z")).toBeNull()
  })

  it("scarta una data inesistente invece di farla scivolare al mese dopo", () => {
    // new Date(2026, 1, 31) diventerebbe il 3 marzo senza controllo.
    expect(parseMyrestoo("Prenotazione CONFERMATA: mar, 31 feb. | 20:00 | 2 PAX | X", "2026-02-01T10:00:00Z")).toBeNull()
  })
})

describe("parseScidoo", () => {
  const corpo = `
    Gentile Ferrazzi Alessandro, questa e' la sua conferma di prenotazione.
    Arrivo: Domenica 29 Novembre 2026
    Partenza: Lunedi 30 Novembre 2026
    Ospiti: 3
  `

  it("legge arrivo, partenza, ospiti e calcola le notti", () => {
    const r = parseScidoo("Ferrazzi Alessandro questa e' la sua conferma di prenotazione - Villa I Barronci", corpo)
    expect(r).not.toBeNull()
    expect(r!.referenceDate).toBe("2026-11-29")
    expect(r!.payload.partenza).toBe("2026-11-30")
    expect(r!.payload.ospiti).toBe(3)
    expect(r!.payload.notti).toBe(1)
    expect(r!.payload.esito).toBe("confermata")
  })

  /**
   * Il primo regex per il codice prenotazione era
   * `(?:Prenotazione|N\.?|Numero)[:\s#]*([A-Z0-9-]{3,20})` e su email reali
   * restituiva "uovo": la N opzionale agganciava la N di "Nuovo".
   * Un riferimento sbagliato e' peggio di uno assente, perche' diventa la
   * chiave contro i doppioni.
   */
  it("non estrae un codice da 'Nuovo'", () => {
    const r = parseScidoo("conferma di prenotazione", `Nuovo arrivo!\n${corpo}`)
    expect(r!.externalRef).toBeNull()
  })

  it("estrae il codice solo quando e' etichettato e contiene cifre", () => {
    const r = parseScidoo("conferma di prenotazione", `Prenotazione n. 84213\n${corpo}`)
    expect(r!.externalRef).toBe("84213")
  })

  it("riconosce una cancellazione dall'oggetto", () => {
    const r = parseScidoo("Cancellazione prenotazione - Villa I Barronci", corpo)
    expect(r!.payload.esito).toBe("annullata")
  })

  it("senza data di arrivo non produce nulla", () => {
    expect(parseScidoo("conferma di prenotazione", "Grazie per averci scritto.")).toBeNull()
  })

  it("scarta un mese che non esiste", () => {
    const r = parseScidoo("conferma", "Arrivo: Domenica 29 Brumaio 2026\nOspiti: 2")
    expect(r).toBeNull()
  })
})

describe("structuredSourceOf", () => {
  it("riconosce le due sorgenti strutturate", () => {
    expect(structuredSourceOf("no-reply@myrestoo.net")).toBe("myrestoo")
    expect(structuredSourceOf("noreply@scidoo.com")).toBe("scidoo")
  })

  it("non rivendica una email qualunque", () => {
    expect(structuredSourceOf("mario@gmail.com")).toBeNull()
    expect(structuredSourceOf(null)).toBeNull()
  })
})
