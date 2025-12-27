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
      <Navigation lang="it" />
      <HeroSlider
        title="VILLA I BARRONCI"
        subtitle="RESORT & SPA"
        description="Tra le colline del Chianti, la tua vacanza di charme in Toscana: villa d'epoca con piscina, Area Benessere e parco privato"
        ctaText="SCOPRI I BARRONCI"
        ctaLink="/"
      />
      <AboutSection
        title="Villa I Barronci"
        subtitle="Resort & Spa"
        description="La tua vacanza di charme in Toscana ti aspetta tra le colline del Chianti: villa d'epoca con piscina, area benessere e parco privato"
        content="Ci sono momenti nella vita – e se non ci sono, occorre crearseli – in cui è finalmente arrivato il momento di farsi un regalo. Luoghi come Villa I Barronci Resort & Spa, nel cuore del Chianti, esistono per questo, per premiarci. Chi ama la Toscana e la sua vegetazione rigogliosa, che regala benessere e armonia, non può non amare un'antica villa del XIII secolo, ristrutturata per essere la scenografia dei vostri sogni. Tutta l'energia che utilizziamo qui in villa deriva da impianti di produzione idroelettrici 'green' certificati."
      />
      <PoolSection
        title="Piscina & Jacuzzi"
        description="Una piscina panoramica mozzafiato, con Jacuzzi"
        ctaText="TUFFATI IN PISCINA"
        ctaLink="/piscina-jacuzzi"
      />
      <RestaurantSection
        title="da Tiberio a San Casciano"
        description="La vacanza in Toscana ha trovato la sua migliore cucina"
        ctaText="SCOPRI IL RISTORANTE"
        ctaLink="/ristorante"
      />
      <FlorenceSection />
      <ThreeFeaturesSection lang="it" />
      <CTAIconsSection lang="it" />
      <CantinaAntinoriSection lang="it" />
      <Footer lang="it" />
    </>
  )
}
