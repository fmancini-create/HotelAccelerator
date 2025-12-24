import type { Metadata } from "next"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import { ImageGallery } from "@/components/image-gallery"
import { ChevronDown } from "lucide-react"
import { getPhotosByCategory } from "@/lib/get-photos"

export const metadata: Metadata = {
  title: "Suite Private Access - Villa I Barronci Resort & Spa",
  description:
    "Luxury experience con accesso privato nel cuore del Chianti. La nostra Suite con ingresso indipendente offre il massimo del comfort e della privacy nella parte antica della villa.",
}

export default async function SuitePrivateAccessPage() {
  const galleryImages = await getPhotosByCategory("suite-private-access")

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <section className="relative h-screen flex items-center justify-center text-center text-white">
        <ImageGallery images={galleryImages} heroIndex={0} className="absolute inset-0" />

        <div className="relative z-10 max-w-4xl px-4 pointer-events-none">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif mb-6">
            Luxury Experience in the heart of Chianti
          </h1>
          <p className="text-xl md:text-2xl font-light">Con accesso privato nella parte antica della villa</p>
        </div>
      </section>

      <section className="bg-[#f5f1ed] py-20">
        <div className="container mx-auto px-6">
          <div className="flex justify-center mb-8">
            <ChevronDown className="w-8 h-8 text-[#8b7355]" />
          </div>

          <div className="max-w-4xl mx-auto text-center mb-12">
            <div className="w-20 h-px bg-[#8b7355] mx-auto mb-8" />
            <h2 className="text-4xl md:text-5xl font-serif mb-8 text-balance">Suite Private Access</h2>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Il massimo del lusso e della privacy nel cuore del Chianti
            </p>

            <a
              href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-[#8b7355] text-white px-12 py-4 hover:bg-[#6d5a42] transition-colors uppercase font-semibold"
            >
              PRENOTA
            </a>
          </div>

          <div className="max-w-3xl mx-auto space-y-6 text-muted-foreground leading-relaxed text-pretty">
            <p>
              La nostra Suite con accesso privato si trova nella parte antica della villa e rappresenta il massimo del
              comfort e dell'eleganza. Con ingresso indipendente, offre totale privacy e la possibilità di vivere
              un'esperienza esclusiva immersi nella storia e nella bellezza del Chianti.
            </p>
            <p>
              Spazi ampi e raffinati, arredati con gusto toscano, offrono un rifugio perfetto per chi cerca relax
              assoluto e un'atmosfera intima. Ogni dettaglio è pensato per garantire un soggiorno indimenticabile.
            </p>
          </div>
        </div>
      </section>

      <CTAIconsSection />
      <ThreeFeaturesSection />
      <Footer />
    </div>
  )
}
