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
import { getCurrentTenant } from "@/lib/get-tenant"

export default async function TenantHomePage() {
  const tenant = await getCurrentTenant()

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
