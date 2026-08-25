import "server-only"
import Stripe from "stripe"

let stripeClient: Stripe | undefined

/**
 * Creates the Stripe client only when a request needs it.
 *
 * This keeps configuration errors confined to billing routes instead of
 * failing unrelated route discovery during a production build.
 */
export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set")
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      apiVersion: "2026-04-22.dahlia",
      typescript: true,
    })
  }

  return stripeClient
}
