import { z, type ZodSchema } from "zod"

/**
 * UUID schema for validating IDs
 */
export const uuidSchema = z.string().uuid()

/**
 * Email schema for validating email addresses
 */
export const emailSchema = z.string().email()

/**
 * Category schema for photo categories
 */
export const categorySchema = z.enum([
  "suite",
  "suite-private-access",
  "tuscan-style",
  "dependance-deluxe",
  "dependance-economy",
  "piscina",
  "ristorante",
  "giardino",
  "common",
])

/**
 * URL schema
 */
export const urlSchema = z.string().url()

/**
 * Non-empty string schema
 */
export const nonEmptyStringSchema = z.string().min(1)

/**
 * Generic validation function
 * Throws error if validation fails
 */
export function validateInput<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new Error(`Validation error: ${result.error.message}`)
  }
  return result.data
}

/**
 * Safe validation function - returns null instead of throwing
 */
export function safeValidateInput<T>(schema: ZodSchema<T>, data: unknown): T | null {
  const result = schema.safeParse(data)
  if (!result.success) {
    return null
  }
  return result.data
}

/**
 * File validation schema
 */
export const fileValidationSchema = z.object({
  maxSize: z.number().default(10 * 1024 * 1024), // 10MB default
  allowedTypes: z.array(z.string()).default(["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"]),
})

/**
 * Validate a file
 */
export function validateFile(
  file: File,
  options: { maxSize?: number; allowedTypes?: string[] } = {},
): { valid: boolean; error?: string } {
  const maxSize = options.maxSize || 10 * 1024 * 1024 // 10MB
  const allowedTypes = options.allowedTypes || ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"]

  if (file.size > maxSize) {
    return { valid: false, error: `File too large (max ${maxSize / 1024 / 1024}MB)` }
  }

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: `File type not allowed: ${file.type}` }
  }

  return { valid: true }
}

/**
 * Sanitize filename
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 100)
}

/**
 * Photo delete schema
 */
export const photoDeleteSchema = z.object({
  url: z.string().url(),
})

/**
 * Photo update schema
 */
export const photoUpdateSchema = z.object({
  url: z.string().url(),
  alt: z.string().max(500).optional(),
  title: z.string().max(200).optional(),
  category: categorySchema.optional(),
})

/**
 * Sanitize HTML - removes dangerous tags and attributes
 */
export function sanitizeHtml(input: string): string {
  if (!input) return ""

  return (
    input
      // Remove script tags and content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      // Remove event handlers
      .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "")
      // Remove javascript: URLs
      .replace(/javascript:/gi, "")
      // Remove dangerous tags
      .replace(/<(iframe|object|embed|link|style|meta)[^>]*>/gi, "")
      // Escape remaining HTML entities
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .trim()
  )
}
