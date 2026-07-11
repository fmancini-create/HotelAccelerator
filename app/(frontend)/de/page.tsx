import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import HeroSlider from "@/components/hero-slider"
import AboutSection from "@/components/about-section"
import PoolSection from "@/components/pool-section"
import RestaurantSection from "@/components/restaurant-section"
import FlorenceSection from "@/components/florence-section"
import ThreeFeaturesSection from "@/components/three-features-section"
import CTAIconsSection from "@/components/cta-icons-section"
import CantinaAntinoriSection from "@/components/cantina-antinori-section"

export const metadata = {
  title: "Resort Spa Toskana Agritourismus San Casciano Val di Pesa",
  description:
    "Ihr Luxusurlaub in der Toskana erwartet Sie in den Hügeln des Chianti: historische Villa mit Pool, Wellnessbereich und privatem Park",
}

export default function GermanHomePage() {
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
