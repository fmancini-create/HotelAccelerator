import type { CurrentTenant } from "@/lib/get-tenant"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { HeroSlider } from "@/components/hero-slider"
import { AboutSection } from "@/components/about-section"
import { PoolSection } from "@/components/pool-section"
import { RestaurantSection } from "@/components/restaurant-section"
import { FlorenceSection } from "@/components/florence-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { CantinaAntinoriSection } from "@/components/cantina-antinori-section"

interface TenantHomePageProps {
  tenant: CurrentTenant
}

export function TenantHomePage({ tenant }: TenantHomePageProps) {
  // Per ora mostra il contenuto di Villa I Barronci
  // In futuro questo sarà dinamico basato sui dati del CMS del tenant
  return (
    <>
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
    </>
  )
}
