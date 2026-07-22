/**
 * Security utility to prevent service_role usage in user-facing API routes.
 * 
 * Use this as a safeguard in critical user API endpoints to ensure
 * they're not accidentally using service_role which bypasses RLS.
 */

export function assertNoServiceRoleUsage(context: string): void {
  if (process.env.NODE_ENV === "production") {
    if (context.includes("service_role")) {
      throw new Error("Service role usage is not allowed in user API endpoints")
    }
  }
}
