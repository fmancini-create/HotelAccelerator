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

export const metadata = {
  title: "Bed & Breakfast Resort in Tuscany Chianti San Casciano | Villa I Barronci Resort & Spa",
  description:
    "Your luxury holiday in Tuscany awaits you in the hills of the Chianti region: a period villa with pool, wellness area and private park",
}

export default function EnglishHomePage() {
  return (
    <>
      <Navigation lang="en" />
      <HeroSlider
        title="VILLA I BARRONCI"
        subtitle="RESORT & SPA"
        description="In the hills of Chianti, your luxury holiday in Tuscany: period villa with pool, Wellness Area and private park"
        ctaText="DISCOVER I BARRONCI"
        ctaLink="/en"
      />
      <AboutSection
        title="Villa I Barronci"
        subtitle="Resort & Spa"
        description="Your luxury holiday in Tuscany awaits you in the hills of the Chianti region: a period villa with pool, wellness area and private park"
        content="There are times in life – and if there aren't, we should create them – when the moment has finally come to give ourselves a gift. Places like Villa I Barronci Resort & Spa, nestled in the heart of the Chianti region, exist for this reason, to reward ourselves. Those who love Tuscany and its lush vegetation, which bestows wellbeing and harmony, cannot help but love an ancient villa from the thirteenth century, refurbished to be the setting of your dreams. All the energy we use here at the villa comes from certified 'green' hydroelectric production plants."
      />
      <PoolSection
        title="Pool & Jacuzzi"
        description="A breathtaking panoramic pool, with Jacuzzi"
        ctaText="DIVE INTO THE POOL"
        ctaLink="/en/swimming-pool-jacuzzi"
      />
      <RestaurantSection
        title="da Tiberio a San Casciano"
        description="La vacanza in Toscana ha trovato la sua migliore cucina"
        ctaText="DISCOVER THE RESTAURANT"
        ctaLink="/en/restaurant"
      />
      <FlorenceSection />
      <ThreeFeaturesSection lang="en" />
      <CTAIconsSection lang="en" />
      <CantinaAntinoriSection lang="en" />
      <Footer lang="en" />
    </>
  )
}
