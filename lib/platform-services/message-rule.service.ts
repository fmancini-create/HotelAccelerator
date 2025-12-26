import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { MessageRuleRepository } from "@/lib/platform-repositories/message-rule.repository"
import type {
  MessageRule,
  CreateMessageRuleData,
  UpdateMessageRuleData,
} from "@/lib/platform-repositories/message-rule.repository"
import {
  ValidationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  InvariantViolationError,
} from "@/lib/errors"
import { logCommandExecution } from "@/lib/logging/command-log"

export class MessageRuleService {
  static async listRules(request: Request): Promise<MessageRule[]> {
    const propertyId = await getAuthenticatedPropertyId(request)
    return MessageRuleRepository.findByPropertyId(propertyId)
  }

  static async getRule(request: Request, ruleId: string): Promise<MessageRule> {
    const propertyId = await getAuthenticatedPropertyId(request)
    const rule = await MessageRuleRepository.findById(ruleId)
    if (!rule) {
      throw new NotFoundError("Rule not found")
    }
    if (rule.property_id !== propertyId) {
      throw new AuthorizationError("Access denied: rule belongs to different property")
    }
    return rule
  }

  static async createRule(
    request: Request,
    ruleData: Omit<CreateMessageRuleData, "property_id">,
    actorId?: string,
  ): Promise<MessageRule> {
    const propertyId = await getAuthenticatedPropertyId(request)
    if (!ruleData.name || !ruleData.name.trim()) {
      throw new ValidationError("Rule name is required")
    }
    if (!ruleData.message_content?.body || !ruleData.message_content.body.trim()) {
      throw new ValidationError("Message body is required")
    }
    const existingRule = await MessageRuleRepository.findByName(propertyId, ruleData.name.trim())
    if (existingRule) {
      throw new ConflictError("A rule with this name already exists")
    }
    this.validateConditions(ruleData.rule_type, ruleData.conditions)
    if (ruleData.start_date && ruleData.end_date) {
      const startDate = new Date(ruleData.start_date)
      const endDate = new Date(ruleData.end_date)
      if (endDate <= startDate) {
        throw new InvariantViolationError("End date must be after start date")
      }
    }
    const executeCreate = () =>
      MessageRuleRepository.create({
        ...ruleData,
        property_id: propertyId,
        name: ruleData.name.trim(),
      })
    if (actorId) {
      return await logCommandExecution(
        actorId,
        propertyId,
        "create_rule",
        "message_rule",
        ruleData.name.trim(),
        {
          rule_type: ruleData.rule_type,
          is_active: ruleData.is_active,
          has_date_range: !!(ruleData.start_date && ruleData.end_date),
        },
        executeCreate,
      )
    }
    return await executeCreate()
  }

  static async updateRule(
    request: Request,
    ruleId: string,
    ruleData: Omit<UpdateMessageRuleData, "property_id">,
    actorId?: string,
  ): Promise<MessageRule> {
    const propertyId = await getAuthenticatedPropertyId(request)
    const existingRule = await MessageRuleRepository.findById(ruleId)
    if (!existingRule) {
      throw new NotFoundError("Rule not found")
    }
    if (existingRule.property_id !== propertyId) {
      throw new AuthorizationError("Access denied: rule belongs to different property")
    }
    if (ruleData.name !== undefined) {
      if (!ruleData.name.trim()) {
        throw new ValidationError("Rule name cannot be empty")
      }
      const duplicateRule = await MessageRuleRepository.findByName(propertyId, ruleData.name.trim(), ruleId)
      if (duplicateRule) {
        throw new ConflictError("A rule with this name already exists")
      }
      ruleData.name = ruleData.name.trim()
    }
    if (ruleData.message_content?.body !== undefined && !ruleData.message_content.body.trim()) {
      throw new ValidationError("Message body cannot be empty")
    }
    if (ruleData.rule_type && ruleData.conditions) {
      this.validateConditions(ruleData.rule_type, ruleData.conditions)
    }
    if (ruleData.start_date && ruleData.end_date) {
      const startDate = new Date(ruleData.start_date)
      const endDate = new Date(ruleData.end_date)
      if (endDate <= startDate) {
        throw new InvariantViolationError("End date must be after start date")
      }
    }
    const executeUpdate = () => MessageRuleRepository.update(ruleId, ruleData)
    if (actorId) {
      return await logCommandExecution(
        actorId,
        propertyId,
        "update_rule",
        "message_rule",
        ruleId,
        {
          fields_updated: Object.keys(ruleData).length,
          is_active: ruleData.is_active,
        },
        executeUpdate,
      )
    }
    return await executeUpdate()
  }

  static async deleteRule(request: Request, ruleId: string, actorId?: string): Promise<void> {
    const propertyId = await getAuthenticatedPropertyId(request)
    const rule = await MessageRuleRepository.findById(ruleId)
    if (!rule) {
      throw new NotFoundError("Rule not found")
    }
    if (rule.property_id !== propertyId) {
      throw new AuthorizationError("Access denied: rule belongs to different property")
    }
    const executeDelete = () => MessageRuleRepository.delete(ruleId)
    if (actorId) {
      await logCommandExecution(actorId, propertyId, "delete_rule", "message_rule", ruleId, { ruleId }, executeDelete)
      return
    }
    await executeDelete()
  }

  static async toggleRuleActive(
    request: Request,
    ruleId: string,
    isActive: boolean,
    actorId?: string,
  ): Promise<MessageRule> {
    const propertyId = await getAuthenticatedPropertyId(request)
    const rule = await MessageRuleRepository.findById(ruleId)
    if (!rule) {
      throw new NotFoundError("Rule not found")
    }
    if (rule.property_id !== propertyId) {
      throw new AuthorizationError("Access denied: rule belongs to different property")
    }
    if (actorId) {
      return await logCommandExecution(
        actorId,
        propertyId,
        "toggle_rule_active",
        "message_rule",
        ruleId,
        { ruleId, isActive },
        () => MessageRuleRepository.toggleActive(ruleId, isActive),
      )
    }
    return await MessageRuleRepository.toggleActive(ruleId, isActive)
  }

  private static validateConditions(
    ruleType: "page_visits" | "room_interest" | "return_visitor",
    conditions: Record<string, unknown>,
  ): void {
    switch (ruleType) {
      case "page_visits":
        if (!conditions.min || (conditions.min as number) < 1) {
          throw new InvariantViolationError("page_visits requires min >= 1")
        }
        break
      case "room_interest":
        if (!conditions.min_clicks || (conditions.min_clicks as number) < 1) {
          throw new InvariantViolationError("room_interest requires min_clicks >= 1")
        }
        break
      case "return_visitor":
        if (!conditions.min_days || (conditions.min_days as number) < 1) {
          throw new InvariantViolationError("return_visitor requires min_days >= 1")
        }
        if (!conditions.max_days || (conditions.max_days as number) < (conditions.min_days as number)) {
          throw new InvariantViolationError("return_visitor requires max_days > min_days")
        }
        break
    }
  }
}
