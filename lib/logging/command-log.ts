import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Standard command log event structure
 * Tracks who did what, when, and on which entity
 */
export interface CommandLogEvent {
  timestamp: string
  actor_id: string // auth.uid
  property_id: string
  command_name: string
  entity_type: "conversation" | "message" | "email_channel" | "message_rule"
  entity_id: string
  payload_summary: Record<string, any> // Sanitized, no PII
  result: "success" | "failure"
  error_code?: string
  duration_ms?: number
}

/**
 * Non-intrusive command logger
 * NEVER throws, NEVER blocks execution, fails silently
 */
export class CommandLogger {
  private static supabase: SupabaseClient | null = null

  /**
   * Initialize logger with Supabase client
   */
  static initialize(supabase: SupabaseClient) {
    this.supabase = supabase
  }

  /**
   * Log command execution (intent before execution)
   */
  static async logIntent(
    actorId: string,
    propertyId: string,
    commandName: string,
    entityType: CommandLogEvent["entity_type"],
    entityId: string,
    payloadSummary: Record<string, any>,
  ): Promise<void> {
    try {
      if (!this.supabase) return

      const event: CommandLogEvent = {
        timestamp: new Date().toISOString(),
        actor_id: actorId,
        property_id: propertyId,
        command_name: commandName,
        entity_type: entityType,
        entity_id: entityId,
        payload_summary: this.sanitizePayload(payloadSummary),
        result: "success", // Intent is always success
      }

      // Fire and forget - do not await
      this.supabase.from("command_logs").insert(event).then().catch()
    } catch (error) {
      // Silent failure - logging must never break execution
    }
  }

  /**
   * Log command result (success or failure after execution)
   */
  static async logResult(
    actorId: string,
    propertyId: string,
    commandName: string,
    entityType: CommandLogEvent["entity_type"],
    entityId: string,
    result: "success" | "failure",
    errorCode?: string,
    durationMs?: number,
  ): Promise<void> {
    try {
      if (!this.supabase) return

      const event: CommandLogEvent = {
        timestamp: new Date().toISOString(),
        actor_id: actorId,
        property_id: propertyId,
        command_name: commandName,
        entity_type: entityType,
        entity_id: entityId,
        payload_summary: {},
        result,
        error_code: errorCode,
        duration_ms: durationMs,
      }

      // Fire and forget - do not await
      this.supabase.from("command_logs").insert(event).then().catch()
    } catch (error) {
      // Silent failure - logging must never break execution
    }
  }

  /**
   * Sanitize payload to remove PII and sensitive data
   */
  private static sanitizePayload(payload: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {}

    for (const [key, value] of Object.entries(payload)) {
      // Skip sensitive fields
      if (
        key.includes("password") ||
        key.includes("token") ||
        key.includes("secret") ||
        key.includes("oauth") ||
        key.includes("content") || // message content
        key.includes("body") || // message body
        key === "email_address" // PII
      ) {
        sanitized[key] = "[REDACTED]"
        continue
      }

      // Include safe fields
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        sanitized[key] = value
      } else if (Array.isArray(value)) {
        sanitized[key] = `[Array:${value.length}]`
      } else if (value !== null && typeof value === "object") {
        sanitized[key] = `[Object]`
      }
    }

    return sanitized
  }
}

/**
 * Helper to log command execution with timing
 */
export async function logCommandExecution<T>(
  actorId: string,
  propertyId: string,
  commandName: string,
  entityType: CommandLogEvent["entity_type"],
  entityId: string,
  payloadSummary: Record<string, any>,
  executor: () => Promise<T>,
): Promise<T> {
  const startTime = Date.now()

  // Log intent
  await CommandLogger.logIntent(actorId, propertyId, commandName, entityType, entityId, payloadSummary)

  try {
    // Execute command
    const result = await executor()
    const durationMs = Date.now() - startTime

    // Log success
    await CommandLogger.logResult(
      actorId,
      propertyId,
      commandName,
      entityType,
      entityId,
      "success",
      undefined,
      durationMs,
    )

    return result
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorCode = error instanceof Error && "code" in error ? (error as any).code : "UNKNOWN_ERROR"

    // Log failure
    await CommandLogger.logResult(
      actorId,
      propertyId,
      commandName,
      entityType,
      entityId,
      "failure",
      errorCode,
      durationMs,
    )

    // Re-throw error - logging must not swallow errors
    throw error
  }
}

/**
 * Simple command log - logs after execution has completed
 * Use when you don't need timing or don't want wrapper pattern
 */
export async function logCommand(options: {
  command: string
  payload?: Record<string, any>
  actorId?: string
  propertyId?: string
  entityType?: CommandLogEvent["entity_type"]
  entityId?: string
  result?: Record<string, any>
  error?: string
}): Promise<void> {
  try {
    // Fire and forget - never block execution
    const event: Partial<CommandLogEvent> = {
      timestamp: new Date().toISOString(),
      actor_id: options.actorId || "system",
      property_id: options.propertyId || "",
      command_name: options.command,
      entity_type: options.entityType || "conversation",
      entity_id: options.entityId || "",
      payload_summary: options.payload || {},
      result: options.error ? "failure" : "success",
      error_code: options.error,
    }

    // Log to console in development
    if (process.env.NODE_ENV === "development") {
      console.log("[CommandLog]", options.command, options.result || options.error || "success")
    }
  } catch {
    // Silent failure
  }
}
