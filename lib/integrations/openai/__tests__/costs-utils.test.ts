import { describe, expect, it } from "vitest"
import {
  aggregateOpenAICostPages,
  buildOpenAICostsUrl,
  summarizeOpenAICosts,
} from "@/lib/integrations/openai/costs-utils"

describe("OpenAI cost helpers", () => {
  it("costruisce la query senza esporre segreti e ripete i filtri array", () => {
    const url = new URL(
      buildOpenAICostsUrl({
        startTime: 1_000,
        endTime: 2_000,
        limit: 30,
        projectIds: ["proj_voice", "proj_other"],
        apiKeyIds: ["key_voice"],
      }),
    )

    expect(url.origin + url.pathname).toBe("https://api.openai.com/v1/organization/costs")
    expect(url.searchParams.get("start_time")).toBe("1000")
    expect(url.searchParams.get("end_time")).toBe("2000")
    expect(url.searchParams.get("bucket_width")).toBe("1d")
    expect(url.searchParams.get("limit")).toBe("30")
    expect(url.searchParams.getAll("project_ids")).toEqual(["proj_voice", "proj_other"])
    expect(url.searchParams.getAll("api_key_ids")).toEqual(["key_voice"])
    expect(url.searchParams.getAll("group_by")).toEqual(["line_item"])
  })

  it("somma bucket, line item e rettifiche senza confondere giorni diversi", () => {
    const aggregation = aggregateOpenAICostPages([
      {
        object: "page",
        data: [
          {
            object: "bucket",
            start_time: 1_783_036_800,
            end_time: 1_783_123_200,
            results: [
              {
                object: "organization.costs.result",
                amount: { value: 0.12, currency: "usd" },
                line_item: "gpt-realtime-2",
              },
              {
                object: "organization.costs.result",
                amount: { value: 0.03, currency: "usd" },
                line_item: "gpt-5.6-sol",
              },
              {
                object: "organization.costs.result",
                amount: { value: -0.01, currency: "usd" },
                line_item: "provider-adjustment",
              },
            ],
          },
          {
            object: "bucket",
            start_time: 1_783_123_200,
            end_time: 1_783_209_600,
            results: [
              {
                object: "organization.costs.result",
                amount: { value: 0.2, currency: "usd" },
                line_item: "gpt-realtime-2",
              },
            ],
          },
        ],
        has_more: false,
        next_page: null,
      },
    ])

    expect(aggregation.currency).toBe("usd")
    expect(aggregation.total).toBeCloseTo(0.34)
    expect(aggregation.daily.map((item) => item.amount)).toEqual([0.13999999999999999, 0.2])
    expect(aggregation.lineItems).toEqual([
      { name: "gpt-realtime-2", amount: 0.32 },
      { name: "gpt-5.6-sol", amount: 0.03 },
      { name: "provider-adjustment", amount: -0.01 },
    ])
  })

  it("calcola oggi, mese e ultimi 30 giorni sui bucket UTC", () => {
    const aggregation = aggregateOpenAICostPages([
      {
        object: "page",
        data: [
          {
            start_time: Date.UTC(2026, 7, 31) / 1000,
            end_time: Date.UTC(2026, 8, 1) / 1000,
            results: [{ object: "organization.costs.result", amount: { value: 1, currency: "usd" } }],
          },
          {
            start_time: Date.UTC(2026, 8, 1) / 1000,
            end_time: Date.UTC(2026, 8, 2) / 1000,
            results: [{ object: "organization.costs.result", amount: { value: 2, currency: "usd" } }],
          },
        ],
      },
    ])

    const summary = summarizeOpenAICosts({
      aggregation,
      now: new Date("2026-09-01T22:00:00Z"),
    })

    expect(summary.today).toBe(2)
    expect(summary.monthToDate).toBe(2)
    expect(summary.last30Days).toBe(3)
  })
})
