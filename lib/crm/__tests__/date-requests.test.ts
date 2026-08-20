import { describe, it, expect } from "vitest"
import {
  classificaConversazione,
  confermaDaOggetto,
  normalizzaDominio,
  faseDi,
  notaEsitoIA,
  provenienzaDa,
  acquisitaDalSito,
  traduciEstrazione,
  riferimentoStabile,
  nottiDa,
  FASI,
} from "../date-requests"

/**
 * I casi non sono inventati: sono le righe VERE misurate il 19/08/2026 sulle 27
 * estrazioni non di gestionale della struttura Villa I Barronci. Usare oggetti e
 * mittenti reali è il motivo per cui queste prove hanno trovato difetti veri:
 * un caso inventato conferma solo ciò che immaginavo.
 */
const DOMINIO = "ibarronci.com"

describe("normalizzaDominio", () => {
  it("tollera le forme in cui un dominio viene scritto davvero", () => {
    expect(normalizzaDominio("ibarronci.com")).toBe("ibarronci.com")
    expect(normalizzaDominio("https://www.ibarronci.com/")).toBe("ibarronci.com")
    expect(normalizzaDominio("  IBARRONCI.COM ")).toBe("ibarronci.com")
  })

  it("restituisce null quando non c'è un dominio, invece di una stringa vuota", () => {
    // Una stringa vuota renderebbe vero `email.endsWith("@")`, cioè
    // classificherebbe QUALUNQUE email come interna: silenziosamente, la
    // pipeline si svuoterebbe.
    expect(normalizzaDominio("")).toBeNull()
    expect(normalizzaDominio(null)).toBeNull()
    expect(normalizzaDominio(undefined)).toBeNull()
  })
})

describe("classificaConversazione — esclusioni", () => {
  it("riconosce interne le 6 pratiche di casa misurate", () => {
    const interne = [
      { contact_email: "f.mancini@ibarronci.com", subject: "Da validare — rimborso Matt Lenz" },
      { contact_email: "info@ibarronci.com", subject: "Rimborso approvato — Matt Lenz" },
      { contact_email: "direzione@ibarronci.com", subject: "Richiesta di rimborso: Marianna Fratini" },
      { contact_email: "info@ibarronci.com", subject: "Fwd: RICHIESTA INTERVENTO I BARRONCI SRL" },
      { contact_email: "info@ibarronci.com", subject: "Rimborso approvato — Anna Verifica" },
      { contact_email: "marianna@ibarronci.com", subject: "Invito: Marianna e Alessia - Villa I Barronci" },
    ]
    for (const c of interne) {
      expect(classificaConversazione(c, DOMINIO)).toBe("interna")
    }
  })

  it("riconosce le conversazioni di prova dalla convenzione ZZ PROVA", () => {
    expect(classificaConversazione({ contact_email: null, subject: "Chat dal sito · ZZ PROVA browser" }, DOMINIO)).toBe(
      "prova",
    )
    // La convenzione si usa in vari modi: la regola non deve dipendere dalla
    // spaziatura o dalle maiuscole, o metà delle prove resterebbe in pipeline.
    expect(classificaConversazione({ subject: "zz prova whatsapp" }, DOMINIO)).toBe("prova")
    expect(classificaConversazione({ subject: "ZZPROVA" }, DOMINIO)).toBe("prova")
  })

  it("NON scambia per interna un'email che contiene il dominio senza esserne parte", () => {
    // `includes` avrebbe detto "interna" per entrambe: sono domini di terzi che
    // citano il nome. Sarebbero state richieste vere buttate via.
    expect(classificaConversazione({ contact_email: "tizio@ibarronci.com.evil.net" }, DOMINIO)).toBe("lavorabile")
    expect(classificaConversazione({ contact_email: "info@notibarronci.com" }, DOMINIO)).toBe("lavorabile")
  })

  it("senza dominio della struttura non esclude nessuno", () => {
    // Preferenza dichiarata: se il dato manca, si mostra tutto. Il contrario
    // sarebbe una pipeline vuota senza spiegazione.
    expect(classificaConversazione({ contact_email: "info@ibarronci.com" }, null)).toBe("lavorabile")
  })
})

describe("confermaDaOggetto", () => {
  it("riconosce la conferma del gestionale sfuggita al mittente", () => {
    // Caso reale: la conversazione non ha email mittente, quindi `method` non
    // l'aveva riconosciuta come Scidoo ed era finita fra le richieste di persone.
    expect(confermaDaOggetto("Morin Deborah this is your booking confirmation")).toBe(true)
    expect(classificaConversazione({ contact_email: null, subject: "Morin Deborah this is your booking confirmation" }, DOMINIO)).toBe(
      "conferma_gestionale",
    )
  })

  it("non scatta su una richiesta che parla di conferma senza esserlo", () => {
    expect(confermaDaOggetto("Posso avere conferma della disponibilità?")).toBe(false)
    expect(confermaDaOggetto("")).toBe(false)
    expect(confermaDaOggetto(null)).toBe(false)
  })
})

describe("classificaConversazione — chi resta lavorabile", () => {
  it("tiene in pipeline sia i lead veri sia i fornitori, per scelta dichiarata", () => {
    // Nessun segnale distingue un fornitore da un lead: sono tutti domini
    // esterni. Restano visibili in "Da qualificare" perché un falso positivo
    // sotto gli occhi costa meno di una richiesta vera nascosta.
    const esterne = [
      "info@matrimonio.com",
      "landtours@topcruises.it",
      "laura.roncari@caseificioelda.it",
      "direzione@idroflorens.it",
      "ufficiocommerciale@patatasnana.com",
      "clienti@sibill.com",
      "email.campaign@sg.booking.com",
      "info@beefamily.it",
    ]
    for (const email of esterne) {
      expect(classificaConversazione({ contact_email: email, subject: "qualcosa" }, DOMINIO)).toBe("lavorabile")
    }
  })

  it("tiene le conversazioni senza email, come WhatsApp e la chat del sito", () => {
    expect(classificaConversazione({ contact_email: null, subject: "WhatsApp · Mario Rossi" }, DOMINIO)).toBe("lavorabile")
    expect(classificaConversazione({ contact_email: "", subject: "Chat dal sito · Sito hotel" }, DOMINIO)).toBe("lavorabile")
  })
})

describe("faseDi — solo segnali umani collocano", () => {
  it("l'esito letto dall'IA non colloca NIENTE", () => {
    // È il difetto vero corretto: con la deduzione dall'esito, "Chiusura
    // TUS114A" di Topcruises finiva in Confermata e il caseificio in Richiesta
    // aperta. La pagina raccontava vendite che nessuno ha fatto.
    for (const esito of ["confermata", "aperta", "confirmed", "open", "persa", "lost"]) {
      expect(faseDi({ stage: null, quoted_rate_cents: null, outcome: esito } as never)).toBe("da_qualificare")
    }
  })

  it("la scelta dell'operatore vince su tutto", () => {
    expect(faseDi({ stage: "confermata", quoted_rate_cents: 45_000 })).toBe("confermata")
    expect(faseDi({ stage: "persa", quoted_rate_cents: 45_000 })).toBe("persa")
    // Retrocedere una vendita a "Preventivo inviato" perché c'è una cifra
    // farebbe sparire la vendita dalla colonna giusta.
    expect(faseDi({ stage: "aperta", quoted_rate_cents: 45_000 })).toBe("aperta")
  })

  it("una tariffa scritta a mano vale come fase: l'IA non ne produce mai", () => {
    expect(faseDi({ stage: null, quoted_rate_cents: 45_000 })).toBe("preventivo_inviato")
    // Zero e null non sono un preventivo: sono l'assenza di preventivo.
    expect(faseDi({ stage: null, quoted_rate_cents: 0 })).toBe("da_qualificare")
    expect(faseDi({ stage: null, quoted_rate_cents: null })).toBe("da_qualificare")
  })

  it("una fase con un nome ignoto non fa sparire la riga", () => {
    // Il database ha un vincolo che rifiuta i nomi inventati, ma se un valore
    // arrivasse comunque, la riga deve restare visibile in "Da qualificare"
    // invece di finire in una colonna che non esiste.
    expect(faseDi({ stage: "fase_inesistente", quoted_rate_cents: null })).toBe("da_qualificare")
    expect(faseDi({ stage: "  ", quoted_rate_cents: null })).toBe("da_qualificare")
  })

  it("ogni fase dichiarata è raggiungibile da una scelta dell'operatore", () => {
    // Una colonna che nessuna azione può riempire è una promessa vuota.
    for (const f of FASI) {
      if (f.key === "da_qualificare") {
        expect(faseDi({ stage: null, quoted_rate_cents: null })).toBe("da_qualificare")
      } else {
        expect(faseDi({ stage: f.key, quoted_rate_cents: null })).toBe(f.key)
      }
    }
  })
})

describe("notaEsitoIA", () => {
  it("mostra la lettura dell'IA come nota, non come verdetto", () => {
    expect(notaEsitoIA("confermata")).toBe("l'IA ha letto: confermata")
    expect(notaEsitoIA("aperta")).toBe("l'IA ha letto: aperta")
  })

  it("tace quando l'IA non ha letto niente", () => {
    expect(notaEsitoIA(null)).toBeNull()
    expect(notaEsitoIA("")).toBeNull()
    expect(notaEsitoIA("   ")).toBeNull()
  })
})

describe("provenienza e blocchi", () => {
  it("legge la provenienza dal metodo registrato, non dal mittente", () => {
    expect(provenienzaDa("regole:scidoo")).toBe("scidoo")
    expect(provenienzaDa("regole:scidoo:v2")).toBe("scidoo")
    expect(provenienzaDa("regole:myrestoo")).toBe("myrestoo")
    expect(provenienzaDa("modello")).toBe("conversazione")
    expect(provenienzaDa(null)).toBe("conversazione")
  })

  it("solo il gestionale è 'acquisita dal sito'", () => {
    expect(acquisitaDalSito("scidoo")).toBe(true)
    expect(acquisitaDalSito("myrestoo")).toBe(true)
    expect(acquisitaDalSito("conversazione")).toBe(false)
    expect(acquisitaDalSito("")).toBe(false)
  })
})

describe("traduciEstrazione", () => {
  const base = { id: "e1", property_id: "p1", conversation_id: "c1", kind: "domanda", method: "modello" }

  it("scarta le estrazioni che non hanno nemmeno cercato una data", () => {
    expect(traduciEstrazione({ ...base, payload: {} }, null)).toBeNull()
    expect(traduciEstrazione({ ...base, payload: null }, null)).toBeNull()
  })

  it("tiene le 12 righe con arrivo presente ma nullo, se hanno un esito", () => {
    // Scartarle perché manca una data nasconderebbe proprio il lavoro da fare.
    const r = traduciEstrazione({ ...base, payload: { arrivo: null, esito: "aperta" } }, null)
    expect(r?.requested_check_in).toBeNull()
    expect(r?.outcome).toBe("aperta")
  })

  it("scarta una riga senza data E senza esito: non resterebbe niente da mostrare", () => {
    expect(traduciEstrazione({ ...base, payload: { arrivo: null } }, null)).toBeNull()
  })

  it("non scrive 0 bambini quando il dato non è stato rilevato", () => {
    const r = traduciEstrazione({ ...base, payload: { arrivo: "2026-09-01", ospiti: 2 } }, null)
    expect(r?.guests_children).toBeNull()
    expect(r?.guests_adults).toBe(2)
  })
})

describe("nottiDa", () => {
  it("usa il valore dichiarato quando c'è", () => {
    expect(nottiDa({ notti: 3 }, "2026-09-01", "2026-09-05")).toBe(3)
  })

  it("altrimenti le calcola dalle due date", () => {
    // Le estrazioni del modello non portano `notti`: senza questo calcolo la
    // colonna sarebbe vuota proprio per le richieste che contano.
    expect(nottiDa({}, "2026-09-01", "2026-09-04")).toBe(3)
  })

  it("resta null invece di stimare, quando una data manca o le date sono assurde", () => {
    expect(nottiDa({}, "2026-09-01", null)).toBeNull()
    expect(nottiDa({}, "2026-09-05", "2026-09-01")).toBeNull()
  })
})

describe("riferimentoStabile", () => {
  it("usa conversazione e date, non l'id dell'estrazione", () => {
    // L'estrattore rilegge la stessa conversazione a ogni nuova versione di
    // configurazione: con l'id come chiave, ogni ritocco avrebbe duplicato la
    // pipeline intera.
    expect(riferimentoStabile({ id: "e1", conversation_id: "c1" }, "2026-09-01", "2026-09-05")).toBe(
      "conv:c1|2026-09-01|2026-09-05",
    )
    expect(riferimentoStabile({ id: "e2", conversation_id: "c1" }, "2026-09-01", "2026-09-05")).toBe(
      "conv:c1|2026-09-01|2026-09-05",
    )
  })

  it("ripiega sull'id solo senza conversazione, per non restare fuori dall'indice", () => {
    expect(riferimentoStabile({ id: "e1", conversation_id: null }, null, null)).toBe("estrazione:e1")
  })
})
