import "server-only"
import Stripe from "stripe"

// Lazy singleton: non istanziare Stripe a import-time. Cosi' `next build`
// (collect page data) non fallisce quando STRIPE_SECRET_KEY manca in
// sandbox/preview. Il client viene creato solo al primo utilizzo runtime.
let stripeClient: Stripe | null = null

export function getStripe(): Stripe {
  const apiKey = process.env.STRIPE_SECRET_KEY
  if (!apiKey) {
    throw new Error("Missing STRIPE_SECRET_KEY")
  }

  if (!stripeClient) {
    stripeClient = new Stripe(apiKey, {
      apiVersion: "2024-12-18.acacia",
    })
  }

  return stripeClient
}

// Re-export product types and data from shared file
export { ADDON_PRODUCTS, getAddonProduct } from "./products"
export type { AddonProduct } from "./products"
