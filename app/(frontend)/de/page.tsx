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
      <Navigation lang="de" />
      <HeroSlider
        title="VILLA I BARRONCI"
        subtitle="RESORT & SPA"
        description="In den Hügeln des Chianti, Ihr Luxusurlaub in der Toskana: historische Villa mit Pool, Wellnessbereich und privatem Park"
        ctaText="I BARRONCI ENTDECKEN"
        ctaLink="/de"
      />
      <AboutSection
        title="Villa I Barronci"
        subtitle="Resort & Spa"
        description="Ihr Luxusurlaub in der Toskana erwartet Sie in den Hügeln des Chianti: historische Villa mit Pool, Wellnessbereich und privatem Park"
        content="Es gibt Momente im Leben – und wenn es sie nicht gibt, sollten wir sie schaffen – in denen es endlich an der Zeit ist, sich selbst ein Geschenk zu machen. Orte wie Villa I Barronci Resort & Spa im Herzen des Chianti existieren aus diesem Grund, um uns zu belohnen. Wer die Toskana und ihre üppige Vegetation liebt, kann nicht umhin, eine alte Villa aus dem 13. Jahrhundert zu lieben, die renoviert wurde, um die Kulisse Ihrer Träume zu sein."
      />
      <PoolSection
        title="Pool & Whirlpool"
        description="Ein atemberaubender Panoramapool mit Whirlpool"
        ctaText="IN DEN POOL EINTAUCHEN"
        ctaLink="/de/pool-jacuzzi"
      />
      <RestaurantSection
        title="da Tiberio in San Casciano"
        description="Der Urlaub in der Toskana hat seine beste Küche gefunden"
        ctaText="RESTAURANT ENTDECKEN"
        ctaLink="/de/restaurant"
      />
      <FlorenceSection />
      <ThreeFeaturesSection lang="de" />
      <CTAIconsSection lang="de" />
      <CantinaAntinoriSection lang="de" />
      <Footer lang="de" />
    </>
  )
}
