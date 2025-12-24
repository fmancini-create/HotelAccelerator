import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Dienstleistungen - Villa I Barronci Resort & Spa",
  description:
    "Jeder Komfort für einen unvergesslichen Aufenthalt: 24h Rezeption, kostenfreies WLAN, Privatparkplatz, NCC-Transfer, Fahrradverleih und vieles mehr.",
  alternates: {
    canonical: "/de/dienstleistungen",
    languages: {
      it: "/servizi",
      en: "/en/services",
      fr: "/fr/services",
    },
  },
}

export default function DienstleistungenPage() {
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
            Jeder Komfort für einen unvergesslichen Aufenthalt
          </h1>
          <p className="text-lg md:text-xl text-center max-w-2xl text-balance">Villa I Barronci Dienstleistungen</p>
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
              Wenn Sie das Beste von Ihrem Resort in der Toskana verlangen, sind Sie hier richtig!
            </p>
            <a
              href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&lang=2"
              className="inline-block px-8 py-3 bg-[#8b7355] text-white hover:bg-[#7a6347] transition-colors"
            >
              BUCHEN
            </a>
          </div>

          <div className="prose prose-lg max-w-none text-muted-foreground space-y-6">
            <p>
              In der <strong>Villa I Barronci Resort & Spa</strong> kümmern wir uns während des gesamten Aufenthalts um
              unsere Gäste und bieten eine breite Palette von Dienstleistungen, die speziell darauf ausgelegt sind, den
              Urlaub in unseren wunderbaren Gebieten optimal zu gestalten.
            </p>

            <p>
              Sie können sie auf Ihre bevorzugte Weise erkunden, Ihr Auto auf unserem kostenlosen, videoüberwachten
              Privatparkplatz abstellen und den <strong>Fahrradverleih</strong> nutzen (auf Anfrage, kostenpflichtig,
              externer Hotelservice).
            </p>

            <div className="bg-background p-8 rounded-lg mt-12">
              <h3 className="font-serif text-2xl text-foreground mb-6">Unsere Dienstleistungen</h3>
              <ul className="space-y-3 text-muted-foreground">
                <li>✓ 24-Stunden-Rezeption</li>
                <li>✓ Check-in von 15:00 bis 21:00 Uhr</li>
                <li>✓ Check-out bis 10:30 Uhr</li>
                <li>✓ Express- und privater Check-in und Check-out</li>
                <li>✓ Nachtportier ab 22:00 Uhr</li>
                <li>✓ Kostenloses WLAN in der gesamten Anlage</li>
                <li>✓ Babysitter-Service (auf Anfrage)</li>
                <li>✓ Zimmerservice</li>
                <li>✓ Gepäckaufbewahrung und Concierge-Service</li>
                <li>
                  ✓ Wäscheservice mit chemischer Reinigung und Bügeln (auf Anfrage, kostenpflichtig, externer Service)
                </li>
                <li>
                  ✓ <strong>Transfer mit NCC-Service</strong> (auf Anfrage, kostenpflichtig, externer Hotelservice,
                  mindestens 2 Tage im Voraus zu buchen)
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
