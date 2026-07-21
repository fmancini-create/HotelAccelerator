import "server-only"

/**
 * Lato server del Widget Recensioni.
 * Ri-esporta tipi/costanti client-safe + utility server-only (token).
 */

export * from "@/lib/reviews/widget-shared"

/** Token pubblico opaco URL-safe (server-only: usa crypto Node). */
export function generateWidgetToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return "rw_" + Buffer.from(bytes).toString("base64url")
}
