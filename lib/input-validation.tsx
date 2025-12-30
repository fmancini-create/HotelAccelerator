import { z } from "zod"

/**
 * Common validation schemas for API inputs
 */

// UUID validation
export const uuidSchema = z.string().uuid("Invalid UUID format")

// Email validation
export const emailSchema = z.string().email("Invalid email format").max(255)

// Safe string (no script injection)
export const safeStringSchema = z
  .string()
  .max(1000)
  .refine((val) => !/<script/i.test(val), "Script tags not allowed")

// Photo ID validation
export const photoIdSchema = uuidSchema

// Category validation
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

// File upload validation
export const fileUploadSchema = z.object({
  name: z.string().max(255),
  type: z.string().regex(/^image\/(jpeg|png|gif|webp|svg\+xml)$/, "Invalid image type"),
  size: z.number().max(10 * 1024 * 1024, "File too large (max 10MB)"),
})

// Photo update schema
export const photoUpdateSchema = z.object({
  photoId: uuidSchema,
  alt: safeStringSchema.optional(),
  isPublished: z.boolean().optional(),
  categoryIds: z.array(uuidSchema).optional(),
})

// Photo delete schema
export const photoDeleteSchema = z.object({
  photoId: uuidSchema,
})

// Pagination schema
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

/**
 * Validate and sanitize input, returning typed result or throwing
 */
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")
    throw new ValidationError(`Validation failed: ${errors}`)
  }
  return result.data
}

/**
 * Custom validation error
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ValidationError"
  }
}

/**
 * Sanitize HTML to prevent XSS
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;")
}

/**
 * Validate URL is from allowed domains
 */
export function isAllowedUrl(url: string, allowedDomains: string[]): boolean {
  try {
    const parsed = new URL(url)
    return allowedDomains.some((domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`))
  } catch {
    return false
  }
}
