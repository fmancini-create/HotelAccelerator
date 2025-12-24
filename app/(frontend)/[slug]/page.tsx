import { Navigation } from "@/components/navigation"
import { HeroSlider } from "@/components/hero-slider"
import { AboutSection } from "@/components/about-section"
import { PoolSection } from "@/components/pool-section"
import { RestaurantSection } from "@/components/restaurant-section"
import { FlorenceSection } from "@/components/florence-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { CantinaAntinoriSection } from "@/components/cantina-antinori-section"
import { Footer } from "@/components/footer"
import Script from "next/script"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function TenantHomePage({ params }: PageProps) {
  const { slug } = await params

  // Verifica che il tenant esista
  const supabase = await createClient()
  const { data: tenant } = await supabase
    .from("properties")
    .select("*")
    .or(`slug.eq.${slug},subdomain.eq.${slug}`)
    .eq("frontend_enabled", true)
    .single()

  if (!tenant) {
    notFound()
  }

  // Schema.org dinamico basato sul tenant
  const hotelSchema = {
    "@context": "https://schema.org",
    "@type": "Hotel",
    name: tenant?.name || "Hotel",
    description: tenant?.seo_description || "",
    url: tenant?.custom_domain
      ? `https://${tenant.custom_domain}`
      : tenant?.subdomain
        ? `https://${tenant.subdomain}.hotelaccelerator.com`
        : "",
  }

  return (
    <>
      <Script
        id="hotel-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(hotelSchema) }}
      />
      <main className="min-h-screen">
        <Navigation />
        <HeroSlider />
        <AboutSection />
        <PoolSection />
        <RestaurantSection />
        <FlorenceSection />
        <ThreeFeaturesSection />
        <CTAIconsSection />
        <CantinaAntinoriSection />
        <Footer />
      </main>
    </>
  )
}
