/**
 * HotelAccelerator pricing plans.
 *
 * Two models:
 * - Commission-based: monthly fee + % on incremental revenue
 * - Fixed fee: flat monthly rate per room
 *
 * Prices stored in cents (EUR). Server-side source of truth — never trust
 * client-submitted prices.
 */

export type PlanType = "commission" | "fixed_fee" | "setup" | "addon"

export interface Plan {
  id: string
  name: string
  type: PlanType
  description: string
  /** Base monthly fee in cents (EUR). For commission plans this is the minimum. */
  basePriceInCents: number
  /** Commission percentage on incremental revenue (commission plans only). */
  commissionPercent?: number
  /** Per-room monthly fee in cents (fixed_fee plans only). */
  perRoomPriceInCents?: number
  /** One-time setup fee in cents (setup plans only). */
  setupFeeInCents?: number
  /** Features included in this plan. */
  features: string[]
  /** Stripe Price ID for recurring billing (null = custom quote). */
  stripePriceId?: string | null
  /** Is this plan currently available for new subscriptions? */
  isActive: boolean
}

export const PLANS: Plan[] = [
  {
    id: "accelerator-commission",
    name: "Accelerator Commission",
    type: "commission",
    description: "Paghi solo sui risultati: fee mensile base + commissione sul revenue incrementale.",
    basePriceInCents: 9900, // €99/mese base
    commissionPercent: 3,
    features: [
      "Dashboard revenue & KPI",
      "Pricing dinamico AI-driven",
      "Autopilot push al PMS",
      "CRM omnichannel",
      "Tracking visitatori",
      "Report settimanali",
    ],
    stripePriceId: null, // Custom invoicing
    isActive: true,
  },
  {
    id: "accelerator-fixed",
    name: "Accelerator Fixed Fee",
    type: "fixed_fee",
    description: "Fee fissa mensile per camera, prevedibile e scalabile.",
    basePriceInCents: 0,
    perRoomPriceInCents: 500, // €5/camera/mese
    features: [
      "Dashboard revenue & KPI",
      "Pricing dinamico AI-driven",
      "Autopilot push al PMS",
      "CRM omnichannel",
      "Tracking visitatori",
      "Report settimanali",
      "Nessuna commissione variabile",
    ],
    stripePriceId: null, // Custom invoicing
    isActive: true,
  },
  {
    id: "setup-onboarding",
    name: "Setup & Onboarding",
    type: "setup",
    description: "Configurazione iniziale, integrazione PMS, training team.",
    basePriceInCents: 0,
    setupFeeInCents: 49900, // €499 una tantum
    features: [
      "Integrazione PMS dedicata",
      "Configurazione pricing iniziale",
      "Training team (2h)",
      "Supporto prioritario 30gg",
    ],
    stripePriceId: null,
    isActive: true,
  },
  {
    id: "addon-cms",
    name: "CMS Website Builder",
    type: "addon",
    description: "Sito web ottimizzato SEO con CMS drag-and-drop.",
    basePriceInCents: 4900, // €49/mese
    features: [
      "Template SEO-optimized",
      "Editor visuale blocchi",
      "Multilingua automatico",
      "Dominio personalizzato",
      "SSL incluso",
    ],
    stripePriceId: null,
    isActive: true,
  },
  {
    id: "addon-whatsapp",
    name: "WhatsApp Business",
    type: "addon",
    description: "Canale WhatsApp integrato nel CRM con AI assistant.",
    basePriceInCents: 2900, // €29/mese
    features: [
      "WhatsApp Business API",
      "AI auto-reply",
      "Template messaggi",
      "Broadcast segmentati",
    ],
    stripePriceId: null,
    isActive: true,
  },
]

export function getPlanById(planId: string): Plan | undefined {
  return PLANS.find((p) => p.id === planId)
}

export function getActivePlans(): Plan[] {
  return PLANS.filter((p) => p.isActive)
}

/**
 * Calculate monthly price for a plan given room count.
 * Returns amount in cents.
 */
export function calculateMonthlyPrice(plan: Plan, roomCount: number): number {
  if (plan.type === "fixed_fee" && plan.perRoomPriceInCents) {
    return plan.perRoomPriceInCents * roomCount
  }
  return plan.basePriceInCents
}

/**
 * Format price in EUR for display.
 */
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100)
}
