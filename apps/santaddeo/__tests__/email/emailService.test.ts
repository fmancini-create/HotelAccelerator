/**
 * Tests for EmailService: canSendAlert, sendAlertIfNotRecent
 *
 * Mocks: Supabase client, email sender
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock data ──
let mockEmailLogsCount = 0
let mockInsertCalls: any[] = []
let mockSendResult = { success: true, messageId: "msg-1" }

// ── Mock supabase ──
const mockSelect = vi.fn().mockReturnThis()
const mockEq = vi.fn().mockReturnThis()
const mockIs = vi.fn().mockReturnThis()
const mockGte = vi.fn().mockReturnThis()
const mockLimit = vi.fn().mockReturnThis()
const mockInsert = vi.fn((data: any) => {
  mockInsertCalls.push(data)
  return Promise.resolve({ data: null, error: null })
})

const mockFrom = vi.fn((table: string) => {
  if (table === "email_logs") {
    return {
      select: () => ({
        eq: mockEq,
        is: mockIs,
        gte: () => ({
          eq: () => ({
            eq: () => ({
              is: () => Promise.resolve({ count: mockEmailLogsCount }),
              then: (r: any) => r({ count: mockEmailLogsCount }),
            }),
            then: (r: any) => r({ count: mockEmailLogsCount }),
          }),
          then: (r: any) => r({ count: mockEmailLogsCount }),
        }),
        then: (r: any) => r({ count: mockEmailLogsCount }),
      }),
      insert: mockInsert,
    }
  }
  if (table === "hotel_users") {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: () =>
              Promise.resolve({
                data: [{ user_id: "u1", profiles: { email: "admin@hotel.com" } }],
                error: null,
              }),
          }),
        }),
      }),
    }
  }
  return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
  })),
  createServiceRoleClient: vi.fn(async () => ({
    from: mockFrom,
  })),
}))

// ── Mock email sender ──
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => mockSendResult),
}))

// ── Mock email templates ──
vi.mock("@/lib/email-templates", () => ({
  getTeamInviteEmail: vi.fn(() => "<html>invite</html>"),
  getAlertNotificationEmail: vi.fn(() => "<html>alert</html>"),
  getSystemAlertEmail: vi.fn(() => "<html>system alert</html>"),
}))

vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key")

const { EmailService } = await import("@/lib/services/email-service")

describe("EmailService", () => {
  let service: InstanceType<typeof EmailService>

  beforeEach(() => {
    vi.clearAllMocks()
    mockInsertCalls = []
    mockEmailLogsCount = 0
    mockSendResult = { success: true, messageId: "msg-1" }
    // Access the singleton (getInstance is idempotent)
    service = EmailService.getInstance()
  })

  // 1. canSendAlert returns false if email sent within last 60 minutes
  it("canSendAlert returns false when recent alert exists", async () => {
    mockEmailLogsCount = 1 // simulate: 1 recent alert found

    const canSend = await service.canSendAlert("stale_sync", "hotel-1", 60)

    expect(canSend).toBe(false)
  })

  // 2. canSendAlert returns true if last email is older than 60 minutes
  it("canSendAlert returns true when no recent alert exists", async () => {
    mockEmailLogsCount = 0 // simulate: no recent alerts

    const canSend = await service.canSendAlert("stale_sync", "hotel-1", 60)

    expect(canSend).toBe(true)
  })

  // 3. sendAlertIfNotRecent does not send if canSendAlert is false
  it("sendAlertIfNotRecent returns throttled=true when alert was recently sent", async () => {
    mockEmailLogsCount = 1 // throttle: recent alert exists

    const result = await service.sendAlertIfNotRecent({
      alertType: "stale_sync",
      hotelId: "hotel-1",
      summary: "Dati obsoleti",
      details: ["Ultimo sync > 30 min fa"],
    })

    expect(result.throttled).toBe(true)
    expect(result.sent).toBe(false)
  })

  // 4. sendAlertIfNotRecent saves to email_logs after sending
  it("sendAlertIfNotRecent logs to email_logs after successful send", async () => {
    mockEmailLogsCount = 0 // no throttle
    mockSendResult = { success: true, messageId: "msg-2" }

    await service.sendAlertIfNotRecent({
      alertType: "circuit_breaker_open",
      hotelId: "hotel-2",
      summary: "Circuit breaker aperto",
      details: ["Endpoint /bookings/get.php fallito"],
    })

    // email_logs.insert should have been called
    expect(mockInsert).toHaveBeenCalled()
    const insertedRow = mockInsertCalls[0]
    expect(insertedRow).toMatchObject({
      hotel_id: "hotel-2",
      alert_type: "circuit_breaker_open",
      message: "Circuit breaker aperto",
      success: true,
    })
  })
})
