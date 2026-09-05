import { describe, expect, it } from "vitest"

import { aggregateDailyPmsActivities, calculatePmsKnowledgeCoverage } from "@/lib/pms/shadow/metrics"

describe("calculatePmsKnowledgeCoverage", () => {
  it("parte da 100% di sconoscenza quando non esiste alcuna evidenza", () => {
    expect(calculatePmsKnowledgeCoverage([])).toMatchObject({
      unknownPercent: 100,
      knownPercent: 0,
      sample: "empty",
      observedProcedures: 0,
    })
  })

  it("una procedura ripetuta ma ancora da rivedere conta solo come conoscenza parziale", () => {
    expect(
      calculatePmsKnowledgeCoverage([
        { occurrences: 5, autonomy_threshold: 5, review_status: "pending", status: "proposta", risk: "basso" },
      ]),
    ).toMatchObject({ knownPercent: 50, unknownPercent: 50, pendingProcedures: 1 })
  })

  it("una procedura approvata e sufficientemente osservata arriva al 100% per quella evidenza", () => {
    expect(
      calculatePmsKnowledgeCoverage([
        { occurrences: 7, autonomy_threshold: 5, review_status: "approved", status: "proposta", risk: "medio" },
      ]),
    ).toMatchObject({ knownPercent: 100, unknownPercent: 0, approvedProcedures: 1 })
  })

  it("una procedura rifiutata non viene spacciata per conoscenza valida", () => {
    expect(
      calculatePmsKnowledgeCoverage([
        { occurrences: 20, autonomy_threshold: 5, review_status: "rejected", status: "bloccata", risk: "basso" },
      ]),
    ).toMatchObject({ knownPercent: 0, unknownPercent: 100, rejectedProcedures: 1 })
  })

  it("non lascia che una procedura molto frequente nasconda quelle meno conosciute", () => {
    const result = calculatePmsKnowledgeCoverage([
      { occurrences: 100, autonomy_threshold: 5, review_status: "approved", status: "proposta", risk: "basso" },
      { occurrences: 1, autonomy_threshold: 5, review_status: "pending", status: "osservata", risk: "basso" },
    ])
    expect(result.knownPercent).toBe(55)
    expect(result.unknownPercent).toBe(45)
  })
})

describe("aggregateDailyPmsActivities", () => {
  it("raggruppa la stessa procedura per operatore e mantiene l'ultima esecuzione", () => {
    const rows = [
      {
        id: "a",
        procedure_id: "p1",
        operator_label: "Anna",
        steps_count: 3,
        ended_at: "2026-09-06T08:00:00.000Z",
        procedure: { title: "Check-in", review_status: "approved" as const, risk: "medio" as const },
      },
      {
        id: "b",
        procedure_id: "p1",
        operator_label: "Anna",
        steps_count: 4,
        ended_at: "2026-09-06T10:00:00.000Z",
        procedure: { title: "Check-in", review_status: "approved" as const, risk: "medio" as const },
      },
    ]

    expect(aggregateDailyPmsActivities(rows)).toEqual([
      {
        key: "p1|Anna",
        title: "Check-in",
        operator: "Anna",
        occurrences: 2,
        steps: 7,
        lastAt: "2026-09-06T10:00:00.000Z",
        reviewStatus: "approved",
        risk: "medio",
      },
    ])
  })
})
