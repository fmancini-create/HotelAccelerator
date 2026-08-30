import { describe, expect, it } from "vitest"
import { buildSalesRecommendations, recommendSalesAction, scoreSalesContact } from "../sales-intelligence"

const NOW = new Date("2026-08-29T12:00:00.000Z")

describe("Motore di Vendita Intelligente", () => {
  it("porta in cima un cliente ad alto valore, ricorrente e contattabile", () => {
    const result = recommendSalesAction(
      {
        id: "1",
        name: "Cliente Prioritario",
        phone: "+390551234567",
        email: "cliente@example.com",
        lead_score: 90,
        total_bookings: 8,
        total_revenue_cents: 900000,
        vip_level: "gold",
        last_booking_date: "2026-07-20T00:00:00.000Z",
        marketing_consent: true,
        email_clicks_count: 3,
      },
      NOW,
    )

    expect(result.priority).toBe("alta")
    expect(result.action).toBe("call")
    expect(result.actionLabel).toBe("Chiama oggi")
    expect(result.score).toBeGreaterThanOrEqual(70)
  })

  it("non suggerisce alcun marketing operativo a un disiscritto, neanche per telefono", () => {
    const result = recommendSalesAction(
      {
        id: "2",
        name: "Cliente Disiscritto",
        phone: "+390559999999",
        email: "stop@example.com",
        lead_score: 100,
        total_bookings: 8,
        total_revenue_cents: 900000,
        vip_level: "platinum",
        last_booking_date: "2026-08-20T00:00:00.000Z",
        unsubscribed: true,
        marketing_consent: true,
        email_clicks_count: 6,
      },
      NOW,
    )

    expect(result.score).toBeGreaterThanOrEqual(70)
    expect(result.canExecute).toBe(false)
    expect(result.action).toBe("review")
    expect(result.channel).toBe("verifica")
    expect(result.reason.toLowerCase()).toContain("disiscritto")
  })

  it("non rende eseguibile una chiamata senza consenso verificato", () => {
    const result = recommendSalesAction(
      {
        id: "no-consent",
        name: "Contatto senza consenso",
        phone: "+390551010101",
        lead_score: 100,
        total_bookings: 8,
        total_revenue_cents: 900000,
        vip_level: "platinum",
        marketing_consent: false,
      },
      NOW,
    )

    expect(result.canExecute).toBe(false)
    expect(result.action).toBe("review")
    expect(result.reason.toLowerCase()).toContain("consenso")
  })

  it("propone riattivazione per un cliente storico inattivo", () => {
    const result = recommendSalesAction(
      {
        id: "3",
        name: "Cliente Storico",
        phone: "+390551111111",
        lead_score: 35,
        total_bookings: 3,
        total_revenue_cents: 120000,
        last_booking_date: "2024-01-10T00:00:00.000Z",
        marketing_consent: true,
      },
      NOW,
    )

    expect(result.action).toBe("relationship")
    expect(result.actionLabel).toBe("Riattiva la relazione")
  })

  it("ordina le raccomandazioni per punteggio decrescente", () => {
    const results = buildSalesRecommendations(
      [
        { id: "a", name: "Basso", lead_score: 10 },
        { id: "b", name: "Alto", lead_score: 80, phone: "+390552222222", total_revenue_cents: 700000 },
        { id: "c", name: "Medio", lead_score: 45, email: "medio@example.com", marketing_consent: true },
      ],
      NOW,
    )

    expect(results.map((item) => item.contactId)).toEqual(["b", "c", "a"])
  })

  it("mantiene il punteggio entro 0 e 100", () => {
    const maximum = scoreSalesContact(
      {
        id: "x",
        lead_score: 100,
        total_revenue_cents: 99_000_000,
        total_bookings: 10,
        vip_level: "platinum",
        email_clicks_count: 10,
        last_booking_date: "2026-08-20T00:00:00.000Z",
        phone: "+390551234567",
        email: "max@example.com",
        marketing_consent: true,
      },
      NOW,
    ).score

    expect(maximum).toBe(100)
    expect(scoreSalesContact({ id: "y", lead_score: -100, unsubscribed: true }, NOW).score).toBe(0)
  })
})
