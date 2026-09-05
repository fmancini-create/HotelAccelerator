import { describe, expect, it } from "vitest"

import {
  analyzeSalesThread,
  extractSingleAmountCents,
  isBookingAcceptanceMessage,
  isBookingCancellationMessage,
  isQuoteLikeMessage,
  resolveOperatorFromSentMessage,
  type SalesOperatorIdentity,
  type SalesThreadMessage,
} from "@/lib/crm/sales-attribution"

const operators: SalesOperatorIdentity[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    email: "maria@hotel.test",
    name: "Maria Rossi",
    signature: "Maria Rossi\nBooking Office",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    email: "luca@hotel.test",
    name: "Luca Bianchi",
    signature: "Luca Bianchi\nReception",
  },
]

function mail(partial: Partial<SalesThreadMessage>): SalesThreadMessage {
  return {
    id: partial.id ?? crypto.randomUUID(),
    labels: partial.labels ?? [],
    from: partial.from ?? "guest@example.com",
    subject: partial.subject ?? "",
    body: partial.body ?? "",
    occurredAt: partial.occurredAt ?? "2026-09-01T10:00:00.000Z",
  }
}

describe("sales attribution", () => {
  it("riconosce un preventivo con contesto hospitality e importo", () => {
    expect(isQuoteLikeMessage("La vostra proposta", "Camera Deluxe, 3 notti. Totale € 1.250,00")).toBe(true)
    expect(isQuoteLikeMessage("Informazioni piscina", "Apertura dalle 9 alle 19")).toBe(false)
  })

  it("distingue conferma e cancellazione/rimborso", () => {
    expect(isBookingAcceptanceMessage("Re: preventivo", "Grazie, confermo la prenotazione.")).toBe(true)
    expect(isBookingAcceptanceMessage("Rimborso", "Non confermo la prenotazione, chiedo rimborso.")).toBe(false)
    expect(isBookingCancellationMessage("Rimborso", "Devo annullare la prenotazione e chiedo rimborso.")).toBe(true)
  })

  it("estrae il valore solo se il preventivo contiene un unico importo distinto", () => {
    expect(extractSingleAmountCents("Preventivo", "Totale soggiorno: € 1.250,50")).toBe(125050)
    expect(extractSingleAmountCents("Preventivo", "Camera A € 900, Camera B € 1.100")).toBeNull()
  })

  it("attribuisce con certezza una firma configurata anche da casella condivisa", () => {
    const result = resolveOperatorFromSentMessage(
      {
        from: "Villa Hotel <booking@hotel.test>",
        body: "Gentile ospite, in allegato il preventivo.\n\nMaria Rossi\nBooking Office",
      },
      operators,
    )
    expect(result).toEqual({
      userId: "11111111-1111-1111-1111-111111111111",
      confidence: 99,
      match: "configured_signature",
    })
  })

  it("crea una chiusura retroattiva solo da preventivo + accettazione cliente", () => {
    const result = analyzeSalesThread(
      [
        mail({
          id: "quote-1",
          labels: ["SENT"],
          from: "Booking <booking@hotel.test>",
          subject: "Preventivo soggiorno",
          body: "Totale € 1.200,00\n\nMaria Rossi\nBooking Office",
          occurredAt: "2026-08-20T09:00:00.000Z",
        }),
        mail({
          id: "close-1",
          subject: "Re: Preventivo soggiorno",
          body: "Perfetto, confermo la prenotazione. Grazie.",
          occurredAt: "2026-08-20T10:00:00.000Z",
        }),
      ],
      operators,
      { stage: null, stageSetBy: null, stageSetAt: null, quotedRateCents: null },
    )

    expect(result.userId).toBe(operators[0].id)
    expect(result.quoteSentAt).toBe("2026-08-20T09:00:00.000Z")
    expect(result.closedAt).toBe("2026-08-20T10:00:00.000Z")
    expect(result.amountCents).toBe(120000)
    expect(result.verificationStatus).toBe("confirmed")
    expect(result.source).toBe("gmail_scan")
  })

  it("il collega che marca Confermata non prende il merito del preventivo scritto da un altro", () => {
    const result = analyzeSalesThread(
      [
        mail({
          id: "quote-maria",
          labels: ["SENT"],
          from: "Booking <booking@hotel.test>",
          subject: "Preventivo soggiorno",
          body: "Totale € 950,00\n\nMaria Rossi\nBooking Office",
          occurredAt: "2026-09-02T09:00:00.000Z",
        }),
      ],
      operators,
      {
        stage: "confermata",
        stageSetBy: operators[1].id,
        stageSetAt: "2026-09-03T12:00:00.000Z",
        quotedRateCents: 95000,
      },
    )

    expect(result.userId).toBe(operators[0].id)
    expect(result.closedAt).toBe("2026-09-03T12:00:00.000Z")
    expect(result.verificationStatus).toBe("confirmed")
    expect(result.source).toBe("gmail_scan")
  })

  it("senza preventivo, chi chiude la fase resta solo un candidato da verificare", () => {
    const result = analyzeSalesThread(
      [],
      operators,
      {
        stage: "confermata",
        stageSetBy: operators[1].id,
        stageSetAt: "2026-09-03T12:00:00.000Z",
        quotedRateCents: 95000,
      },
    )
    expect(result.userId).toBe(operators[1].id)
    expect(result.closedAt).toBe("2026-09-03T12:00:00.000Z")
    expect(result.verificationStatus).toBe("needs_review")
    expect(result.confidence).toBe(75)
    expect(result.source).toBe("pipeline_stage")
  })

  it("una cancellazione cliente successiva toglie la trattativa dalle chiuse ma conserva il preventivo", () => {
    const result = analyzeSalesThread(
      [
        mail({
          id: "quote-1",
          labels: ["SENT"],
          from: "Booking <booking@hotel.test>",
          subject: "Preventivo soggiorno",
          body: "Totale € 1.200,00\n\nMaria Rossi\nBooking Office",
          occurredAt: "2026-08-20T09:00:00.000Z",
        }),
        mail({
          id: "accept-1",
          body: "Confermo la prenotazione, grazie.",
          occurredAt: "2026-08-20T10:00:00.000Z",
        }),
        mail({
          id: "cancel-1",
          body: "Purtroppo devo annullare la prenotazione e chiedo rimborso.",
          occurredAt: "2026-08-22T08:00:00.000Z",
        }),
      ],
      operators,
      { stage: null, stageSetBy: null, stageSetAt: null, quotedRateCents: null },
    )

    expect(result.userId).toBe(operators[0].id)
    expect(result.quoteSentAt).toBe("2026-08-20T09:00:00.000Z")
    expect(result.closedAt).toBeNull()
    expect(result.closeMessageId).toBe("cancel-1")
    expect(result.verificationStatus).toBe("confirmed")
  })
})
