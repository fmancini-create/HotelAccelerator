import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import CTAIconsSection from "@/components/cta-icons-section"
import ThreeFeaturesSection from "@/components/three-features-section"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Healty Tree Room - Casa sull'albero | Villa I Barronci nel Chianti",
  description:
    "Abbraccia la magia della natura tra le colline toscane. Casa sull'albero con vista mozzafiato a Villa I Barronci.",
}

export default function HealthyTreeRoomPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      {/* Hero Section */}
      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url(https://ibarronci.com/wp-content/uploads/2024/11/villa-ibarronci-700.webp)",
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <h1 className="font-serif text-5xl md:text-7xl mb-6">Abbraccia la magia della natura</h1>
          <p className="text-xl md:text-2xl max-w-3xl">tra le colline toscane</p>
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
            <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8">Casa sull'albero</h2>

            <p className="text-lg md:text-xl text-muted-foreground mb-8">Location esclusiva, con vista mozzafiato</p>

            <Button size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white px-12 py-6 text-lg">
              PRENOTA
            </Button>
          </div>

          <div className="max-w-4xl mx-auto space-y-6 text-center text-muted-foreground leading-relaxed">
            <p>
              Immersa nella bellezza naturale del nostro resort nel Chianti, la nostra camera sull'albero offre
              un'esperienza unica a contatto con la natura.
            </p>

            <p>
              Con una vista mozzafiato sulle colline toscane, questa sistemazione esclusiva garantisce un soggiorno
              indimenticabile immersi nella serenità e nel comfort. Ideale per fughe romantiche e momenti di relax,
              questa camera è un vero gioiello dell'esperienza di ospitalità.
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
