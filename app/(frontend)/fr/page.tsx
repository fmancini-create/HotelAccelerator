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
  title: "Resort Spa Toscane Agritourisme San Casciano Val di Pesa",
  description:
    "Vos vacances de luxe en Toscane vous attendent dans les collines du Chianti : villa d'époque avec piscine, espace bien-être et parc privé",
}

export default function FrenchHomePage() {
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
