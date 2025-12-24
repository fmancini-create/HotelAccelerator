import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import CTAIconsSection from "@/components/cta-icons-section"
import ThreeFeaturesSection from "@/components/three-features-section"
import { ImageGallery } from "@/components/image-gallery"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"
import type { Metadata } from "next"
import { getPhotosByCategory } from "@/lib/get-photos"

export const metadata: Metadata = {
  title: "Dependance De Luxe | Villa I Barronci Resort & Spa nel Chianti",
  description: "Dependance De Luxe a Villa I Barronci, indipendenza e comfort nella campagna toscana.",
}

export default async function DependanceDeluxePage() {
  const galleryImages = await getPhotosByCategory("dependance-deluxe")

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      {/* Hero Section with Gallery */}
      <section className="relative h-screen w-full">
        <ImageGallery images={galleryImages} heroIndex={0} className="absolute inset-0" />
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4 pointer-events-none">
          <h1 className="font-serif text-5xl md:text-7xl mb-6">Indipendenza e Comfort</h1>
          <p className="text-xl md:text-2xl max-w-3xl">nella campagna toscana</p>
        </div>
      </section>

      {/* Content Section */}
      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="flex justify-center mb-8">
            <ChevronDown className="w-8 h-8 text-muted-foreground" />
          </div>

          <div className="border-t border-muted mb-12" />

          <div className="max-w-4xl mx-auto text-center mb-12">
            <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8">Dependance De Luxe</h2>

            <p className="text-lg md:text-xl text-muted-foreground mb-8">Un rifugio elegante e riservato</p>

            <Button size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white px-12 py-6 text-lg">
              PRENOTA
            </Button>
          </div>

          <div className="max-w-4xl mx-auto space-y-6 text-center text-muted-foreground leading-relaxed">
            <p>
              La Dependance De Luxe di Villa I Barronci offre un'esperienza di soggiorno unica, combinando
              l'indipendenza di una sistemazione privata con tutti i servizi e comfort del resort.
            </p>

            <p>
              Ideale per chi cerca privacy e tranquillità, questa elegante dependance dispone di arredi raffinati e
              spazi curati, immersa nel verde delle colline del Chianti.
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
