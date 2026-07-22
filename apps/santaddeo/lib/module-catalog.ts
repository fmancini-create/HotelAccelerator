import "server-only"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { ADDON_PRODUCTS, type AddonProduct } from "@/lib/products"

/**
 * Sorgente di verità DB per il catalogo moduli/addon (tabella module_catalog,
 * gestita dal pannello superadmin). Espone i prezzi/trial/feature a runtime
 * cosicché le modifiche del superadmin siano immediatamente visibili sulle
 * pagine pubbliche e nel checkout.
 *
 * Modello prezzi: price_monthly_cents = prezzo MENSILE base. L'annuale è
 * calcolato: monthly * 12 * (1 - annual_discount_pct/100). Trial separati per
 * intervallo. Due Price Stripe (mensile/annuale).
 *
 * Fallback: se la tabella è vuota o non raggiungibile, usa i valori statici
 * storici di lib/products.ts (mai una pagina rotta).
 */
export interface ModuleCatalogEntry {
  key: string
  name: string
  description: string
  category: "addon" | "module"
  currency: string
  // Pricing
  monthlyPriceCents: number
  annualDiscountPct: number
  /** Prezzo annuale calcolato (cents) = monthly * 12 * (1 - sconto%). */
  annualPriceCents: number
  /** Prezzo pieno annuale senza sconto (cents) = monthly * 12. */
  annualFullPriceCents: number
  allowMonthly: boolean
  allowAnnual: boolean
  // Trial separati
  trialDaysMonthly: number
  trialDaysAnnual: number
  // Stripe
  stripeProductId: string | null
  stripePriceMonthlyId: string | null
  stripePriceAnnualId: string | null
  // Meta
  features: string[]
  isPublished: boolean
  isPurchasable: boolean
  sortOrder: number
}

type CatalogRow = {
  key: string
  name: string
  description: string | null
  category: string | null
  price_cents: number | null
  price_monthly_cents: number | null
  annual_discount_pct: number | string | null
  currency: string | null
  trial_days_monthly: number | null
  trial_days_annual: number | null
  allow_monthly: boolean | null
  allow_annual: boolean | null
  features: unknown
  is_published: boolean
  is_purchasable: boolean
  stripe_product_id: string | null
  stripe_price_monthly_id: string | null
  stripe_price_annual_id: string | null
  sort_order: number | null
}

/** Calcola il prezzo annuale scontato (cents) dato il mensile e lo sconto %. */
export function computeAnnualPriceCents(monthlyCents: number, discountPct: number): number {
  const full = monthlyCents * 12
  const discounted = full * (1 - discountPct / 100)
  return Math.round(discounted)
}

function rowToEntry(r: CatalogRow): ModuleCatalogEntry {
  // price_monthly_cents può essere null su righe pre-migrazione: deriva
  // dall'annuale legacy (price_cents / 12) come fallback difensivo.
  const monthly = r.price_monthly_cents ?? (r.price_cents != null ? Math.round(r.price_cents / 12) : 0)
  const discount = r.annual_discount_pct != null ? Number(r.annual_discount_pct) : 0
  return {
    key: r.key,
    name: r.name,
    description: r.description ?? "",
    category: r.category === "module" ? "module" : "addon",
    currency: r.currency ?? "eur",
    monthlyPriceCents: monthly,
    annualDiscountPct: discount,
    annualPriceCents: computeAnnualPriceCents(monthly, discount),
    annualFullPriceCents: monthly * 12,
    allowMonthly: r.allow_monthly ?? true,
    allowAnnual: r.allow_annual ?? true,
    trialDaysMonthly: r.trial_days_monthly ?? 0,
    trialDaysAnnual: r.trial_days_annual ?? 0,
    stripeProductId: r.stripe_product_id,
    stripePriceMonthlyId: r.stripe_price_monthly_id,
    stripePriceAnnualId: r.stripe_price_annual_id,
    features: Array.isArray(r.features) ? (r.features as string[]) : [],
    isPublished: r.is_published,
    isPurchasable: r.is_purchasable,
    sortOrder: r.sort_order ?? 0,
  }
}

/** Converte la definizione statica (fallback) in una entry di catalogo. */
function staticToEntry(p: AddonProduct, sortOrder: number): ModuleCatalogEntry {
  // I valori statici storici sono annuali -> deriva il mensile.
  const monthly = Math.round(p.priceInCents / 12)
  return {
    key: p.id,
    name: p.name,
    description: p.description,
    category: p.id === "premium_expert" ? "addon" : "module",
    currency: "eur",
    monthlyPriceCents: monthly,
    annualDiscountPct: 0,
    annualPriceCents: computeAnnualPriceCents(monthly, 0),
    annualFullPriceCents: monthly * 12,
    allowMonthly: true,
    allowAnnual: true,
    trialDaysMonthly: 0,
    trialDaysAnnual: 0,
    stripeProductId: null,
    stripePriceMonthlyId: null,
    stripePriceAnnualId: null,
    features: p.features,
    isPublished: true,
    isPurchasable: true,
    sortOrder,
  }
}

function staticCatalog(): ModuleCatalogEntry[] {
  return ADDON_PRODUCTS.map((p, i) => staticToEntry(p, (i + 1) * 10))
}

const CATALOG_COLUMNS =
  "key,name,description,category,price_cents,price_monthly_cents,annual_discount_pct,currency,trial_days_monthly,trial_days_annual,allow_monthly,allow_annual,features,is_published,is_purchasable,stripe_product_id,stripe_price_monthly_id,stripe_price_annual_id,sort_order"

/**
 * Ritorna l'intero catalogo dal DB (ordinato per sort_order). Fallback ai
 * valori statici se la query fallisce o non restituisce righe.
 */
export async function getModuleCatalog(): Promise<ModuleCatalogEntry[]> {
  try {
    const supabase = await createServiceRoleClient()
    const { data, error } = await supabase
      .from("module_catalog")
      .select(CATALOG_COLUMNS)
      .order("sort_order", { ascending: true })
    if (error || !data || data.length === 0) {
      if (error) console.error("[v0] getModuleCatalog fallback (errore):", error.message)
      return staticCatalog()
    }
    return (data as CatalogRow[]).map(rowToEntry)
  } catch (err) {
    console.error("[v0] getModuleCatalog fallback (eccezione):", err)
    return staticCatalog()
  }
}

/** Ritorna una singola entry del catalogo per chiave (con fallback statico). */
export async function getModule(key: string): Promise<ModuleCatalogEntry | undefined> {
  const all = await getModuleCatalog()
  return all.find((m) => m.key === key)
}
