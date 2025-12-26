import { describe, it, expect, vi, beforeEach } from "vitest"
import { MessageRuleService } from "../message-rule.service"
import { MessageRuleRepository } from "@/lib/repositories/message-rule.repository"
import { InvariantViolationError, ValidationError, ConflictError } from "@/lib/errors"

// Mock the repository
vi.mock("@/lib/repositories/message-rule.repository", () => ({
  MessageRuleRepository: {
    findById: vi.fn(),
    findByName: vi.fn(),
    findByPropertyId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    toggleActive: vi.fn(),
  },
}))

// Mock auth helper
vi.mock("@/lib/auth-property", () => ({
  getAuthenticatedPropertyId: vi.fn().mockResolvedValue("prop-1"),
}))

describe("MessageRuleService - Critical Invariants", () => {
  const mockRequest = {} as Request

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("INVARIANT: Date range validation", () => {
    it("should throw InvariantViolationError when end_date <= start_date", async () => {
      vi.mocked(MessageRuleRepository.findByName).mockResolvedValue(null)

      await expect(
        MessageRuleService.createRule(mockRequest, {
          name: "Test Rule",
          rule_type: "page_visits",
          conditions: { min: 1 },
          message_content: { body: "Test message" },
          is_active: true,
          start_date: "2024-12-25",
          end_date: "2024-12-20", // Before start date
        }),
      ).rejects.toThrow(InvariantViolationError)
    })

    it("should throw InvariantViolationError when end_date equals start_date", async () => {
      vi.mocked(MessageRuleRepository.findByName).mockResolvedValue(null)

      await expect(
        MessageRuleService.createRule(mockRequest, {
          name: "Test Rule",
          rule_type: "page_visits",
          conditions: { min: 1 },
          message_content: { body: "Test message" },
          is_active: true,
          start_date: "2024-12-25",
          end_date: "2024-12-25", // Same as start date
        }),
      ).rejects.toThrow(InvariantViolationError)
    })

    it("should accept valid date range", async () => {
      vi.mocked(MessageRuleRepository.findByName).mockResolvedValue(null)
      vi.mocked(MessageRuleRepository.create).mockResolvedValue({
        id: "rule-1",
        name: "Test Rule",
        property_id: "prop-1",
      } as any)

      await expect(
        MessageRuleService.createRule(mockRequest, {
          name: "Test Rule",
          rule_type: "page_visits",
          conditions: { min: 1 },
          message_content: { body: "Test message" },
          is_active: true,
          start_date: "2024-12-20",
          end_date: "2024-12-25", // After start date
        }),
      ).resolves.toBeDefined()
    })
  })

  describe("INVARIANT: Return visitor constraints", () => {
    it("should throw InvariantViolationError when max_days <= min_days", async () => {
      vi.mocked(MessageRuleRepository.findByName).mockResolvedValue(null)

      await expect(
        MessageRuleService.createRule(mockRequest, {
          name: "Test Rule",
          rule_type: "return_visitor",
          conditions: { min_days: 10, max_days: 5 }, // max < min
          message_content: { body: "Test message" },
          is_active: true,
        }),
      ).rejects.toThrow(InvariantViolationError)
    })

    it("should throw InvariantViolationError when max_days equals min_days", async () => {
      vi.mocked(MessageRuleRepository.findByName).mockResolvedValue(null)

      await expect(
        MessageRuleService.createRule(mockRequest, {
          name: "Test Rule",
          rule_type: "return_visitor",
          conditions: { min_days: 10, max_days: 10 }, // max = min
          message_content: { body: "Test message" },
          is_active: true,
        }),
      ).rejects.toThrow(InvariantViolationError)
    })

    it("should accept valid return_visitor constraints", async () => {
      vi.mocked(MessageRuleRepository.findByName).mockResolvedValue(null)
      vi.mocked(MessageRuleRepository.create).mockResolvedValue({
        id: "rule-1",
        name: "Test Rule",
        property_id: "prop-1",
      } as any)

      await expect(
        MessageRuleService.createRule(mockRequest, {
          name: "Test Rule",
          rule_type: "return_visitor",
          conditions: { min_days: 5, max_days: 10 }, // max > min
          message_content: { body: "Test message" },
          is_active: true,
        }),
      ).resolves.toBeDefined()
    })
  })

  describe("INVARIANT: Rule type conditions", () => {
    it("should throw InvariantViolationError for page_visits without min >= 1", async () => {
      vi.mocked(MessageRuleRepository.findByName).mockResolvedValue(null)

      await expect(
        MessageRuleService.createRule(mockRequest, {
          name: "Test Rule",
          rule_type: "page_visits",
          conditions: { min: 0 }, // Invalid: must be >= 1
          message_content: { body: "Test message" },
          is_active: true,
        }),
      ).rejects.toThrow(InvariantViolationError)
    })

    it("should throw InvariantViolationError for room_interest without min_clicks >= 1", async () => {
      vi.mocked(MessageRuleRepository.findByName).mockResolvedValue(null)

      await expect(
        MessageRuleService.createRule(mockRequest, {
          name: "Test Rule",
          rule_type: "room_interest",
          conditions: { min_clicks: 0 }, // Invalid: must be >= 1
          message_content: { body: "Test message" },
          is_active: true,
        }),
      ).rejects.toThrow(InvariantViolationError)
    })
  })

  describe("VALIDATION: Duplicate rule name", () => {
    it("should throw ConflictError when rule name already exists", async () => {
      vi.mocked(MessageRuleRepository.findByName).mockResolvedValue({
        id: "existing-rule",
        name: "Duplicate Rule",
        property_id: "prop-1",
      } as any)

      await expect(
        MessageRuleService.createRule(mockRequest, {
          name: "Duplicate Rule",
          rule_type: "page_visits",
          conditions: { min: 1 },
          message_content: { body: "Test message" },
          is_active: true,
        }),
      ).rejects.toThrow(ConflictError)
    })
  })

  describe("VALIDATION: Required fields", () => {
    it("should throw ValidationError when rule name is empty", async () => {
      await expect(
        MessageRuleService.createRule(mockRequest, {
          name: "",
          rule_type: "page_visits",
          conditions: { min: 1 },
          message_content: { body: "Test message" },
          is_active: true,
        }),
      ).rejects.toThrow(ValidationError)
    })

    it("should throw ValidationError when message body is empty", async () => {
      vi.mocked(MessageRuleRepository.findByName).mockResolvedValue(null)

      await expect(
        MessageRuleService.createRule(mockRequest, {
          name: "Test Rule",
          rule_type: "page_visits",
          conditions: { min: 1 },
          message_content: { body: "" },
          is_active: true,
        }),
      ).rejects.toThrow(ValidationError)
    })
  })
})
