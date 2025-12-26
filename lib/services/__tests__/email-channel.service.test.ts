import { describe, it, expect, vi, beforeEach } from "vitest"
import { EmailChannelService } from "../email-channel.service"
import { ValidationError, ConflictError, AuthorizationError } from "@/lib/errors"

describe("EmailChannelService - Critical Invariants", () => {
  let service: EmailChannelService
  let mockSupabase: any

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn(),
    }

    service = new EmailChannelService(mockSupabase)

    // Mock the repository methods on the service instance
    service["repository"] = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      listByProperty: vi.fn(),
      listAssignments: vi.fn(),
      setAssignments: vi.fn(),
    } as any
  })

  describe("VALIDATION: Email format", () => {
    it("should throw ValidationError for invalid email format", async () => {
      await expect(
        service.createChannel("prop-1", {
          email_address: "not-an-email",
          display_name: "Test",
          is_active: true,
          assigned_users: [],
        }),
      ).rejects.toThrow(ValidationError)

      await expect(
        service.createChannel("prop-1", {
          email_address: "missing@",
          display_name: "Test",
          is_active: true,
          assigned_users: [],
        }),
      ).rejects.toThrow(ValidationError)

      await expect(
        service.createChannel("prop-1", {
          email_address: "@domain.com",
          display_name: "Test",
          is_active: true,
          assigned_users: [],
        }),
      ).rejects.toThrow(ValidationError)
    })

    it("should throw ValidationError for empty email", async () => {
      await expect(
        service.createChannel("prop-1", {
          email_address: "",
          display_name: "Test",
          is_active: true,
          assigned_users: [],
        }),
      ).rejects.toThrow(ValidationError)
    })

    it("should accept valid email addresses", async () => {
      const mockRepo = service["repository"]
      vi.mocked(mockRepo.findByEmail).mockResolvedValue(null)
      vi.mocked(mockRepo.create).mockResolvedValue({
        id: "channel-1",
        email_address: "valid@example.com",
        property_id: "prop-1",
      } as any)
      vi.mocked(mockRepo.listAssignments).mockResolvedValue([])

      await expect(
        service.createChannel("prop-1", {
          email_address: "valid@example.com",
          display_name: "Test",
          is_active: true,
          assigned_users: [],
        }),
      ).resolves.toBeDefined()
    })
  })

  describe("INVARIANT: Duplicate email prevention", () => {
    it("should throw ConflictError when email already exists", async () => {
      const mockRepo = service["repository"]
      vi.mocked(mockRepo.findByEmail).mockResolvedValue({
        id: "existing-channel",
        email_address: "duplicate@example.com",
        property_id: "prop-1",
      } as any)

      await expect(
        service.createChannel("prop-1", {
          email_address: "duplicate@example.com",
          display_name: "Test",
          is_active: true,
          assigned_users: [],
        }),
      ).rejects.toThrow(ConflictError)
    })
  })

  describe("AUTHORIZATION: Property ownership", () => {
    it("should throw AuthorizationError when accessing channel from different property", async () => {
      const mockRepo = service["repository"]
      vi.mocked(mockRepo.findById).mockResolvedValue({
        id: "channel-1",
        email_address: "test@example.com",
        property_id: "different-property",
      } as any)

      await expect(service.getChannel("channel-1", "my-property")).rejects.toThrow(AuthorizationError)
    })

    it("should allow access to channel from same property", async () => {
      const mockRepo = service["repository"]
      vi.mocked(mockRepo.findById).mockResolvedValue({
        id: "channel-1",
        email_address: "test@example.com",
        property_id: "my-property",
      } as any)
      vi.mocked(mockRepo.listAssignments).mockResolvedValue([])

      const result = await service.getChannel("channel-1", "my-property")
      expect(result).toBeDefined()
      expect(result?.property_id).toBe("my-property")
    })
  })

  describe("EDGE CASE: Email normalization", () => {
    it("should extract name from email when display_name is null", async () => {
      const mockRepo = service["repository"]
      vi.mocked(mockRepo.findByEmail).mockResolvedValue(null)
      vi.mocked(mockRepo.create).mockResolvedValue({
        id: "channel-1",
        email_address: "john.doe@example.com",
        name: "john.doe",
        property_id: "prop-1",
      } as any)
      vi.mocked(mockRepo.listAssignments).mockResolvedValue([])

      await service.createChannel("prop-1", {
        email_address: "john.doe@example.com",
        display_name: null,
        is_active: true,
        assigned_users: [],
      })

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "john.doe",
        }),
      )
    })
  })
})
