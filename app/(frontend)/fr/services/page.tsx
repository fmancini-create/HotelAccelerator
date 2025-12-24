import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Services - Villa I Barronci Resort & Spa",
  description:
    "Tout le confort pour rendre votre séjour inoubliable : réception 24h, wi-fi gratuit, parking privé, transfert NCC, location de vélos et bien plus.",
  alternates: {
    canonical: "/fr/services",
    languages: {
      it: "/servizi",
      en: "/en/services",
      de: "/de/dienstleistungen",
    },
  },
}

export default function ServicesPage() {
  return (
    <>
      <Navigation />

      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url(https://ibarronci.com/wp-content/uploads/2023/08/Villa-I-Barronci-Panoramica.jpg)",
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>

        <div className="relative h-full flex flex-col items-center justify-center text-white px-4">
          <h1 className="font-serif text-4xl md:text-6xl text-center mb-4 text-balance">
            Tout le confort pour rendre votre séjour inoubliable
          </h1>
          <p className="text-lg md:text-xl text-center max-w-2xl text-balance">Villa I Barronci Services</p>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <div className="w-6 h-10 border-2 border-white rounded-full flex items-start justify-center p-2">
            <div className="w-1 h-3 bg-white rounded-full animate-bounce" />
          </div>
        </div>
      </section>

      <section className="bg-secondary py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl md:text-4xl text-foreground mb-6">Villa I Barronci Resort & Spa</h2>
            <p className="text-lg text-muted-foreground mb-8">
              Si vous exigez le meilleur de votre resort en Toscane, vous êtes au bon endroit !
            </p>
            <a
              href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&lang=3"
              className="inline-block px-8 py-3 bg-[#8b7355] text-white hover:bg-[#7a6347] transition-colors"
            >
              RÉSERVER
            </a>
          </div>

          <div className="prose prose-lg max-w-none text-muted-foreground space-y-6">
            <p>
              À <strong>Villa I Barronci Resort & Spa</strong>, nous prenons soin de nos hôtes tout au long de leur
              séjour, offrant une large gamme de services conçus spécifiquement pour profiter au mieux des vacances dans
              nos merveilleux territoires.
            </p>

            <div className="bg-background p-8 rounded-lg mt-12">
              <h3 className="font-serif text-2xl text-foreground mb-6">Nos services</h3>
              <ul className="space-y-3 text-muted-foreground">
                <li>✓ Réception 24 heures sur 24</li>
                <li>✓ Check-in de 15h à 21h</li>
                <li>✓ Check-out avant 10h30</li>
                <li>✓ Check-in et check-out express et privés</li>
                <li>✓ Portier de nuit à partir de 22h</li>
                <li>✓ Wi-Fi gratuit dans toute la structure</li>
                <li>✓ Service de baby-sitting (sur demande)</li>
                <li>✓ Service en chambre</li>
                <li>✓ Consigne à bagages et service conciergerie</li>
                <li>
                  ✓ Service de blanchisserie avec nettoyage à sec et repassage (sur demande, payant, service externe)
                </li>
                <li>
                  ✓ <strong>Transfert avec service NCC</strong> (sur demande, payant, service externe à l'hôtel, à
                  réserver au moins 2 jours à l'avance)
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <CTAIconsSection />
      <ThreeFeaturesSection />
      <Footer />
    </>
  )
}
