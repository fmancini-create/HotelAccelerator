/**
 * Utility to detect if we're running in v0 preview environment
 * This is used to bypass authentication in development mode
 */

// DEV project (dshdmkmhhbjractpvojp) DECOMMISSIONED.
// v0 sandbox always uses PROD — never bypass auth, never use DEV DB.
export async function isV0Preview(): Promise<boolean> {
  return false
}

export function isV0PreviewSync(): boolean {
  return false
}
