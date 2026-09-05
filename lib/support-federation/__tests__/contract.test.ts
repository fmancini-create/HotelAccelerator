import { describe, expect, it } from "vitest"
import {
  federatedSupportProjectionSchema,
  toInboxConversationStatus,
  toInboxSenderType,
} from "@/lib/support-federation/contract"

const basePayload = {
  tenant_ref: "854adfdd-3607-4428-a45d-61bc63b82c66",
  thread_id: "feedback:134a6576-6386-470a-8308-f90aae5f9186",
  title: "Suggerimento",
  kind: "suggestion" as const,
  source_path: "/dashboard/autofatture",
  reporter: {
    user_id: "0ef7dc62-3d52-4b74-b97c-2efc11558c45",
    name: "Utente Test",
    email: "utente@example.com",
  },
}

describe("federatedSupportProjectionSchema", () => {
  it("accepts the timestamptz RFC3339 representation returned by Supabase", () => {
    const result = federatedSupportProjectionSchema.safeParse({
      ...basePayload,
      messages: [{
        id: "message-1",
        sender: "customer",
        content: "Test",
        created_at: "2026-09-05T15:36:59.053227+00:00",
      }],
    })

    expect(result.success).toBe(true)
  })

  it("continues to accept UTC Z timestamps", () => {
    const result = federatedSupportProjectionSchema.safeParse({
      ...basePayload,
      messages: [{
        id: "message-1",
        sender: "customer",
        content: "Test",
        created_at: "2026-09-05T15:36:59.053Z",
      }],
    })

    expect(result.success).toBe(true)
  })

  it("maps federation values to the real Inbox constraints", () => {
    expect(toInboxSenderType("customer")).toBe("customer")
    expect(toInboxSenderType("agent")).toBe("agent")
    expect(toInboxSenderType("system")).toBe("system")
    expect(toInboxConversationStatus("open")).toBe("open")
    expect(toInboxConversationStatus("closed")).toBe("resolved")
  })
})
