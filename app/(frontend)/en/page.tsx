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
