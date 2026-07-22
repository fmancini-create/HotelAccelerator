import { NextResponse } from "next/server"
import { getModule } from "@/lib/module-catalog"

/**
 * Endpoint PUBBLICO: ritorna i dati di un modulo del catalogo per le pagine di
 * upgrade (prezzo, trial, feature). Espone solo i campi necessari e SOLO se il
 * modulo è pubblicato, così le modifiche del superadmin sono immediatamente
 * visibili sulle pagine pubbliche.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const mod = await getModule(key)
  if (!mod || !mod.isPublished) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 })
  }
  return NextResponse.json({
    module: {
      key: mod.key,
      name: mod.name,
      description: mod.description,
      category: mod.category,
      currency: mod.currency,
      monthlyPriceCents: mod.monthlyPriceCents,
      annualPriceCents: mod.annualPriceCents,
      annualFullPriceCents: mod.annualFullPriceCents,
      annualDiscountPct: mod.annualDiscountPct,
      allowMonthly: mod.allowMonthly,
      allowAnnual: mod.allowAnnual,
      trialDaysMonthly: mod.trialDaysMonthly,
      trialDaysAnnual: mod.trialDaysAnnual,
      features: mod.features,
      isPurchasable: mod.isPurchasable,
    },
  })
}
