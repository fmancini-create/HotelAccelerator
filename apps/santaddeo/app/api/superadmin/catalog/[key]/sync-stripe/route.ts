import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient, getAuthUser } from "@/lib/supabase/server"
import { getStripe } from "@/lib/stripe"

/**
 * POST /api/superadmin/catalog/[key]/sync-stripe
 * Crea/aggiorna su Stripe il Product (nome/descrizione) e il Price del modulo.
 * I Price Stripe sono IMMUTABILI: se il prezzo/intervallo è cambiato (o non
 * esiste ancora un price), ne creiamo uno nuovo e archiviamo il vecchio.
 * Salva stripe_product_id / stripe_price_id nel catalogo.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params

    const authClient = await createClient()
    const user = await getAuthUser(authClient)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const supabase = await createServiceRoleClient()
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe non configurato (STRIPE_SECRET_KEY mancante)" }, { status: 400 })
    }

    const stripe = getStripe()

    const { data: mod, error: modErr } = await supabase
      .from("module_catalog")
      .select("*")
      .eq("key", key)
      .single()
    if (modErr || !mod) return NextResponse.json({ error: "Modulo non trovato" }, { status: 404 })

    // 1. Product: crea se manca, altrimenti aggiorna nome/descrizione.
    let productId = mod.stripe_product_id as string | null
    if (productId) {
      try {
        await stripe.products.update(productId, {
          name: mod.name,
          description: mod.description || undefined,
        })
      } catch {
        // Il product salvato non esiste più su Stripe: ne creiamo uno nuovo.
        productId = null
      }
    }
    if (!productId) {
      const product = await stripe.products.create({
        name: mod.name,
        description: mod.description || undefined,
        metadata: { module_key: key },
      })
      productId = product.id
    }

    // 2. Price: sincronizziamo DUE price (mensile + annuale scontato).
    const currency = (mod.currency || "eur").toLowerCase()
    const monthly = (mod.price_monthly_cents as number | null) ?? Math.round((mod.price_cents as number) / 12)
    const discount = mod.annual_discount_pct != null ? Number(mod.annual_discount_pct) : 0
    const annual = Math.round(monthly * 12 * (1 - discount / 100))

    /**
     * Assicura un Price attivo per il dato intervallo/importo. I Price Stripe
     * sono IMMUTABILI: se quello salvato non combacia (o non esiste), ne creiamo
     * uno nuovo e archiviamo il vecchio.
     */
    async function ensurePrice(
      currentPriceId: string | null,
      unitAmount: number,
      interval: "month" | "year",
    ): Promise<{ priceId: string; created: boolean }> {
      let priceId = currentPriceId
      let needNew = !priceId
      if (priceId) {
        try {
          const existing = await stripe.prices.retrieve(priceId)
          const matches =
            existing.active &&
            existing.unit_amount === unitAmount &&
            existing.currency === currency &&
            existing.recurring?.interval === interval &&
            existing.product === productId
          if (!matches) needNew = true
        } catch {
          needNew = true
        }
      }
      if (needNew) {
        if (priceId) {
          try {
            await stripe.prices.update(priceId, { active: false })
          } catch {
            /* best-effort */
          }
        }
        const price = await stripe.prices.create({
          product: productId,
          unit_amount: unitAmount,
          currency,
          recurring: { interval },
          metadata: { module_key: key, plan_interval: interval },
        })
        priceId = price.id
      }
      return { priceId: priceId as string, created: needNew }
    }

    const monthlyRes = await ensurePrice(mod.stripe_price_monthly_id as string | null, monthly, "month")
    const annualRes = await ensurePrice(mod.stripe_price_annual_id as string | null, annual, "year")

    // 3. Persistiamo gli id nel catalogo.
    const { data: updated, error: upErr } = await supabase
      .from("module_catalog")
      .update({
        stripe_product_id: productId,
        stripe_price_monthly_id: monthlyRes.priceId,
        stripe_price_annual_id: annualRes.priceId,
        updated_at: new Date().toISOString(),
      })
      .eq("key", key)
      .select()
      .single()
    if (upErr) throw upErr

    return NextResponse.json({
      ok: true,
      module: updated,
      createdNewMonthlyPrice: monthlyRes.created,
      createdNewAnnualPrice: annualRes.created,
    })
  } catch (error) {
    console.error("[v0] sync-stripe error:", error)
    const message = error instanceof Error ? error.message : "Errore Stripe"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
