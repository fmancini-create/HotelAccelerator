import { describe, it, expect, vi, beforeEach } from "vitest"
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
      toggleStar: vi.fn(),
    } as any

    service = new InboxWriteService(mockRepository)
  })

  describe("INVARIANT: Outcome → Status Mapping", () => {
    it('should map outcome "confirmed" to status "closed"', async () => {
      const mockConversation = {
        id: "conv-1",
        property_id: "prop-1",
        booking_data: {},
      }

      vi.mocked(mockRepository.getConversation).mockResolvedValue(mockConversation as any)
      vi.mocked(mockRepository.updateBookingData).mockResolvedValue(undefined)
      vi.mocked(mockRepository.updateStatus).mockResolvedValue({ status: "closed" } as any)

      await service.updateOutcome({
        conversationId: "conv-1",
        propertyId: "prop-1",
        outcome: "confirmed",
      })

      // CRITICAL: Verify status was set to "closed"
      expect(mockRepository.updateStatus).toHaveBeenCalledWith("conv-1", "prop-1", "closed")
    })

    it('should map outcome "cancelled" to status "archived"', async () => {
      const mockConversation = {
        id: "conv-1",
        property_id: "prop-1",
        booking_data: {},
      }

      vi.mocked(mockRepository.getConversation).mockResolvedValue(mockConversation as any)
      vi.mocked(mockRepository.updateBookingData).mockResolvedValue(undefined)
      vi.mocked(mockRepository.updateStatus).mockResolvedValue({ status: "archived" } as any)

      await service.updateOutcome({
        conversationId: "conv-1",
        propertyId: "prop-1",
        outcome: "cancelled",
      })

      expect(mockRepository.updateStatus).toHaveBeenCalledWith("conv-1", "prop-1", "archived")
    })

    it('should map outcome "pending" to status "open"', async () => {
      const mockConversation = {
        id: "conv-1",
        property_id: "prop-1",
        booking_data: {},
      }

      vi.mocked(mockRepository.getConversation).mockResolvedValue(mockConversation as any)
      vi.mocked(mockRepository.updateBookingData).mockResolvedValue(undefined)
      vi.mocked(mockRepository.updateStatus).mockResolvedValue({ status: "open" } as any)

      await service.updateOutcome({
        conversationId: "conv-1",
        propertyId: "prop-1",
        outcome: "pending",
      })

      expect(mockRepository.updateStatus).toHaveBeenCalledWith("conv-1", "prop-1", "open")
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
          outcome: "confirmed",
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
