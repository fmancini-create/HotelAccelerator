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
      <Navigation lang="fr" />
      <HeroSlider
        title="VILLA I BARRONCI"
        subtitle="RESORT & SPA"
        description="Dans les collines du Chianti, vos vacances de luxe en Toscane : villa d'époque avec piscine, Espace Bien-être et parc privé"
        ctaText="DÉCOUVRIR I BARRONCI"
        ctaLink="/fr"
      />
      <AboutSection
        title="Villa I Barronci"
        subtitle="Resort & Spa"
        description="Vos vacances de luxe en Toscane vous attendent dans les collines du Chianti : villa d'époque avec piscine, espace bien-être et parc privé"
        content="Il y a des moments dans la vie – et si ce n'est pas le cas, nous devons les créer – où il est enfin temps de se faire un cadeau. Des lieux comme Villa I Barronci Resort & Spa, niché au cœur du Chianti, existent pour cette raison, pour nous récompenser. Ceux qui aiment la Toscane et sa végétation luxuriante ne peuvent qu'aimer une villa ancienne du XIIIe siècle, rénovée pour être le cadre de vos rêves."
      />
      <PoolSection
        title="Piscine & Jacuzzi"
        description="Une piscine panoramique à couper le souffle, avec Jacuzzi"
        ctaText="PLONGEZ DANS LA PISCINE"
        ctaLink="/fr/piscine-jacuzzi"
      />
      <RestaurantSection
        title="da Tiberio à San Casciano"
        description="Les vacances en Toscane ont trouvé leur meilleure cuisine"
        ctaText="DÉCOUVRIR LE RESTAURANT"
        ctaLink="/fr/restaurant"
      />
      <FlorenceSection />
      <ThreeFeaturesSection lang="fr" />
      <CTAIconsSection lang="fr" />
      <CantinaAntinoriSection lang="fr" />
      <Footer lang="fr" />
    </>
  )
}
