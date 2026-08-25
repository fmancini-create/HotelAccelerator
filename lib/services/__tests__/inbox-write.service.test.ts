import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

import { InboxWriteService } from "@/lib/platform-services/inbox-write.service"
import type { InboxWriteRepository } from "@/lib/platform-repositories/inbox-write.repository"
import { ValidationError, NotFoundError } from "@/lib/errors"

describe("InboxWriteService - Critical Invariants", () => {
  let service: InboxWriteService
  let mockRepository: InboxWriteRepository

  beforeEach(() => {
    mockRepository = {
      getConversation: vi.fn(),
      updateBookingData: vi.fn(),
      updateStatus: vi.fn(),
      insertMessage: vi.fn(),
      updateLastMessageAt: vi.fn(),
      markConversationAsRead: vi.fn(),
      markMessagesAsReplied: vi.fn(),
      toggleStar: vi.fn(),
    } as any

    // Constructor now takes a SupabaseClient and builds its own repository.
    // Cast a stub for the client, then inject the mock repository so the
    // existing expectations on mockRepository.* remain valid.
    service = new InboxWriteService({} as any)
    service["repository"] = mockRepository as any
  })

  describe("INVARIANT: Supported outcomes", () => {
    it('should accept outcome "converted"', async () => {
      const mockConversation = {
        id: "conv-1",
        property_id: "prop-1",
        booking_data: {},
      }

      vi.mocked(mockRepository.getConversation).mockResolvedValue(mockConversation as any)

      await expect(service.updateOutcome({
        conversationId: "conv-1",
        propertyId: "prop-1",
        outcome: "converted",
      })).resolves.toEqual({ outcome: "converted" })
    })

    it('should accept outcome "lost"', async () => {
      const mockConversation = {
        id: "conv-1",
        property_id: "prop-1",
        booking_data: {},
      }

      vi.mocked(mockRepository.getConversation).mockResolvedValue(mockConversation as any)

      await expect(service.updateOutcome({
        conversationId: "conv-1",
        propertyId: "prop-1",
        outcome: "lost",
      })).resolves.toEqual({ outcome: "lost" })
    })

    it('should accept outcome "pending"', async () => {
      const mockConversation = {
        id: "conv-1",
        property_id: "prop-1",
        booking_data: {},
      }

      vi.mocked(mockRepository.getConversation).mockResolvedValue(mockConversation as any)

      await expect(service.updateOutcome({
        conversationId: "conv-1",
        propertyId: "prop-1",
        outcome: "pending",
      })).resolves.toEqual({ outcome: "pending" })
    })
  })

  describe("VALIDATION: Outcome values", () => {
    it("should throw ValidationError for invalid outcome", async () => {
      const mockConversation = {
        id: "conv-1",
        property_id: "prop-1",
        booking_data: {},
      }

      vi.mocked(mockRepository.getConversation).mockResolvedValue(mockConversation as any)

      await expect(
        service.updateOutcome({
          conversationId: "conv-1",
          propertyId: "prop-1",
          outcome: "invalid_outcome" as any,
        }),
      ).rejects.toThrow(ValidationError)
    })
  })

  describe("VALIDATION: Message content", () => {
    it("should throw ValidationError for empty message content", async () => {
      const mockConversation = {
        id: "conv-1",
        property_id: "prop-1",
      }

      vi.mocked(mockRepository.getConversation).mockResolvedValue(mockConversation as any)

      await expect(
        service.sendMessage({
          conversationId: "conv-1",
          propertyId: "prop-1",
          content: "",
          senderType: "agent",
        }),
      ).rejects.toThrow(ValidationError)

      await expect(
        service.sendMessage({
          conversationId: "conv-1",
          propertyId: "prop-1",
          content: "   ",
          senderType: "agent",
        }),
      ).rejects.toThrow(ValidationError)
    })

    it("should throw ValidationError for invalid sender type", async () => {
      const mockConversation = {
        id: "conv-1",
        property_id: "prop-1",
      }

      vi.mocked(mockRepository.getConversation).mockResolvedValue(mockConversation as any)

      await expect(
        service.sendMessage({
          conversationId: "conv-1",
          propertyId: "prop-1",
          content: "Hello",
          senderType: "invalid" as any,
        }),
      ).rejects.toThrow(ValidationError)
    })
  })

  describe("EDGE CASE: Conversation not found", () => {
    it("should throw NotFoundError when conversation does not exist", async () => {
      vi.mocked(mockRepository.getConversation).mockResolvedValue(null)

      await expect(
        service.updateOutcome({
          conversationId: "nonexistent",
          propertyId: "prop-1",
          outcome: "converted",
        }),
      ).rejects.toThrow(NotFoundError)

      await expect(
        service.sendMessage({
          conversationId: "nonexistent",
          propertyId: "prop-1",
          content: "Hello",
          senderType: "agent",
        }),
      ).rejects.toThrow(NotFoundError)
    })
  })
})
