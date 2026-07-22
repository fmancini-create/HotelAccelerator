import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { HotelAcceleratorClient } from "./hotel-accelerator-client"
import { JsonLd, buildBreadcrumbList } from "@/components/seo/json-ld"

export const dynamic = "force-dynamic"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Hotel Accelerator - Pricing Dinamico | SANTADDEO",
  description: "Pricing dinamico, fasce di occupazione, monitoraggio RevPAR e suggerimenti tariffari automatici per massimizzare il revenue della tua struttura.",
  alternates: { canonical: "https://www.santaddeo.com/upgrade/hotel-accelerator" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Hotel Accelerator | SANTADDEO Revenue Management",
    description: "Massimizza il revenue con pricing dinamico, fasce di occupazione e suggerimenti tariffari automatici. Fee fissa o commissione sul risultato.",
    url: "https://www.santaddeo.com/upgrade/hotel-accelerator",
    type: "website",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hotel Accelerator | SANTADDEO",
    description: "Pricing dinamico per strutture ricettive. Fee fissa o commissione sul risultato.",
  images: ["https://www.santaddeo.com/og-image.jpg"],
  },
}

export default async function HotelAcceleratorPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fetch pricing configs from DB (public page, no auth required for viewing)
  const supabaseAdmin = await createClient()
  const { data: pricingConfigs } = await supabaseAdmin
    .from("pricing_configs")
    .select("*")
    .eq("is_active", true)
    .order("is_default", { ascending: false })

  // 13/05/2026: prima caricavamo solo il primo "fee" e il primo "commission".
  // Adesso passiamo TUTTI i piani attivi, distinguendo il default da eventuali
  // promo. La pagina mostrera i due piani default + una sezione "Offerte
  // speciali" per le varianti non-default ancora attive (es. promo stagionali
  // create da /superadmin/pricing). Ordine: is_default DESC, poi created_at
  // DESC -> il default e' sempre il primo della sua tipologia.
  const feeConfigs = (pricingConfigs || []).filter((c: any) => c.model_type === "fee")
  const commissionConfigs = (pricingConfigs || []).filter((c: any) => c.model_type === "commission")

  const defaultFee = feeConfigs.find((c: any) => c.is_default) || feeConfigs[0] || null
  const defaultCommission =
    commissionConfigs.find((c: any) => c.is_default) || commissionConfigs[0] || null

  const promoFeePlans = feeConfigs.filter((c: any) => c.id !== defaultFee?.id)
  const promoCommissionPlans = commissionConfigs.filter((c: any) => c.id !== defaultCommission?.id)

  return (
    <>
      <JsonLd
        data={buildBreadcrumbList([{ name: "Hotel Accelerator", path: "/upgrade/hotel-accelerator" }])}
        id="ld-breadcrumb"
      />
      <HotelAcceleratorClient
        isLoggedIn={!!user}
        defaultFee={defaultFee}
        defaultCommission={defaultCommission}
        promoFeePlans={promoFeePlans}
        promoCommissionPlans={promoCommissionPlans}
      />
    </>
  )
}
