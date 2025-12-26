import { SuperAdminRepository } from "@/lib/platform-repositories"
import { ValidationError, AuthorizationError, NotFoundError, ConflictError } from "@/lib/errors"
import type {
  PlatformCollaborator,
  CreateCollaboratorCommand,
  UpdateCollaboratorCommand,
  Structure,
  StructureWithStats,
  CreateStructureCommand,
  UpdateStructureCommand,
  CollaboratorActivity,
  StructureUsageStats,
} from "@/lib/types/super-admin.types"
import { createClient } from "@/lib/supabase/server"

export class SuperAdminService {
  private async getRepository() {
    const supabase = await createClient()
    return new SuperAdminRepository(supabase)
  }

  async verifySuperAdmin(actorEmail: string): Promise<PlatformCollaborator> {
    const repository = await this.getRepository()
    const collaborator = await repository.getCollaboratorByEmail(actorEmail)
    if (!collaborator) {
      throw new AuthorizationError("Access denied: not a platform collaborator")
    }
    if (!collaborator.is_active) {
      throw new AuthorizationError("Access denied: collaborator account is suspended")
    }
    if (collaborator.role !== "super_admin") {
      throw new AuthorizationError("Access denied: super admin role required")
    }
    return collaborator
  }

  async listCollaborators(actorEmail: string): Promise<PlatformCollaborator[]> {
    await this.verifySuperAdmin(actorEmail)
    const repository = await this.getRepository()
    return repository.getAllCollaborators()
  }

  async getCollaboratorDetails(id: string, actorEmail: string): Promise<PlatformCollaborator> {
    await this.verifySuperAdmin(actorEmail)
    const repository = await this.getRepository()
    const collaborator = await repository.getCollaboratorById(id)
    if (!collaborator) {
      throw new NotFoundError(`Collaborator with id ${id} not found`)
    }
    return collaborator
  }

  async createCollaborator(command: CreateCollaboratorCommand, actorEmail: string): Promise<PlatformCollaborator> {
    const repository = await this.getRepository()
    const actor = await this.verifySuperAdmin(actorEmail)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(command.email)) {
      throw new ValidationError("Invalid email format")
    }
    if (!command.name || command.name.trim().length === 0) {
      throw new ValidationError("Name is required")
    }
    const existing = await repository.getCollaboratorByEmail(command.email)
    if (existing) {
      throw new ConflictError(`Collaborator with email ${command.email} already exists`)
    }
    return repository.createCollaborator({
      email: command.email.toLowerCase().trim(),
      name: command.name.trim(),
      role: command.role,
      created_by: actor.id,
    })
  }

  async updateCollaborator(command: UpdateCollaboratorCommand, actorEmail: string): Promise<PlatformCollaborator> {
    await this.verifySuperAdmin(actorEmail)
    const repository = await this.getRepository()
    const existing = await repository.getCollaboratorById(command.id)
    if (!existing) {
      throw new NotFoundError(`Collaborator with id ${command.id} not found`)
    }
    const updates: { name?: string; role?: string } = {}
    if (command.name !== undefined) {
      if (command.name.trim().length === 0) {
        throw new ValidationError("Name cannot be empty")
      }
      updates.name = command.name.trim()
    }
    if (command.role !== undefined) {
      updates.role = command.role
    }
    return repository.updateCollaborator(command.id, updates)
  }

  async suspendCollaborator(id: string, actorEmail: string): Promise<void> {
    await this.verifySuperAdmin(actorEmail)
    const repository = await this.getRepository()
    const collaborator = await repository.getCollaboratorById(id)
    if (!collaborator) {
      throw new NotFoundError(`Collaborator with id ${id} not found`)
    }
    await repository.toggleCollaboratorStatus(id, false)
  }

  async activateCollaborator(id: string, actorEmail: string): Promise<void> {
    await this.verifySuperAdmin(actorEmail)
    const repository = await this.getRepository()
    const collaborator = await repository.getCollaboratorById(id)
    if (!collaborator) {
      throw new NotFoundError(`Collaborator with id ${id} not found`)
    }
    await repository.toggleCollaboratorStatus(id, true)
  }

  async getCollaboratorActivity(id: string, actorEmail: string): Promise<CollaboratorActivity[]> {
    await this.verifySuperAdmin(actorEmail)
    const repository = await this.getRepository()
    return repository.getCollaboratorActivity(id, 20)
  }

  async listStructures(actorEmail: string): Promise<StructureWithStats[]> {
    await this.verifySuperAdmin(actorEmail)
    const repository = await this.getRepository()
    return repository.getAllStructures()
  }

  async getStructureDetails(id: string, actorEmail: string): Promise<Structure> {
    await this.verifySuperAdmin(actorEmail)
    const repository = await this.getRepository()
    const structure = await repository.getStructureById(id)
    if (!structure) {
      throw new NotFoundError(`Structure with id ${id} not found`)
    }
    return structure
  }

  async getStructureUsageStats(id: string, actorEmail: string): Promise<StructureUsageStats> {
    await this.verifySuperAdmin(actorEmail)
    const repository = await this.getRepository()
    const structure = await repository.getStructureById(id)
    if (!structure) {
      throw new NotFoundError(`Structure with id ${id} not found`)
    }
    return repository.getStructureUsageStats(id)
  }

  async createStructure(command: CreateStructureCommand, actorEmail: string): Promise<Structure> {
    await this.verifySuperAdmin(actorEmail)
    const repository = await this.getRepository()
    if (!command.name || command.name.trim().length === 0) {
      throw new ValidationError("Structure name is required")
    }
    if (!command.slug || command.slug.trim().length === 0) {
      throw new ValidationError("Slug is required")
    }
    const slugRegex = /^[a-z0-9-]+$/
    if (!slugRegex.test(command.slug)) {
      throw new ValidationError("Slug must contain only lowercase letters, numbers, and hyphens")
    }
    return repository.createStructure({
      name: command.name.trim(),
      slug: command.slug.trim(),
      plan: command.plan,
      trial_ends_at: command.trial_ends_at || null,
    })
  }

  async updateStructure(command: UpdateStructureCommand, actorEmail: string): Promise<Structure> {
    await this.verifySuperAdmin(actorEmail)
    const repository = await this.getRepository()
    const existing = await repository.getStructureById(command.id)
    if (!existing) {
      throw new NotFoundError(`Structure with id ${command.id} not found`)
    }
    const updates: Record<string, unknown> = {}
    if (command.name !== undefined) {
      if (command.name.trim().length === 0) {
        throw new ValidationError("Name cannot be empty")
      }
      updates.name = command.name.trim()
    }
    if (command.plan !== undefined) updates.plan = command.plan
    if (command.subscription_status !== undefined) {
      updates.subscription_status = command.subscription_status
    }
    if (command.trial_ends_at !== undefined) updates.trial_ends_at = command.trial_ends_at
    if (command.inbox_enabled !== undefined) updates.inbox_enabled = command.inbox_enabled
    if (command.cms_enabled !== undefined) updates.cms_enabled = command.cms_enabled
    if (command.ai_enabled !== undefined) updates.ai_enabled = command.ai_enabled
    return repository.updateStructure(command.id, updates)
  }

  async suspendStructure(id: string, actorEmail: string): Promise<Structure> {
    await this.verifySuperAdmin(actorEmail)
    const repository = await this.getRepository()
    const structure = await repository.getStructureById(id)
    if (!structure) {
      throw new NotFoundError(`Structure with id ${id} not found`)
    }
    return repository.updateStructure(id, { subscription_status: "suspended" })
  }

  async activateStructure(id: string, actorEmail: string): Promise<Structure> {
    await this.verifySuperAdmin(actorEmail)
    const repository = await this.getRepository()
    const structure = await repository.getStructureById(id)
    if (!structure) {
      throw new NotFoundError(`Structure with id ${id} not found`)
    }
    return repository.updateStructure(id, { subscription_status: "active" })
  }
}

// Explicit export for build system compatibility
