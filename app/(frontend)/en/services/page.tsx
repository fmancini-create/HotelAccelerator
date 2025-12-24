import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Services - Villa I Barronci Resort & Spa",
  description:
    "Every comfort to make your stay unforgettable: 24h reception, free wi-fi, private parking, NCC transfer, bike rental and much more.",
  alternates: {
    canonical: "/en/services",
    languages: {
      it: "/servizi",
      de: "/de/dienstleistungen",
      fr: "/fr/services",
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
            Every comfort to make your stay unforgettable
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
              If you demand the best from your resort in Tuscany, you're in the right place!
            </p>
            <a
              href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&lang=1"
              className="inline-block px-8 py-3 bg-[#8b7355] text-white hover:bg-[#7a6347] transition-colors"
            >
              BOOK
            </a>
          </div>

          <div className="prose prose-lg max-w-none text-muted-foreground space-y-6">
            <p>
              At <strong>Villa I Barronci Resort & Spa</strong> we take care of our guests throughout their stay,
              offering a wide range of services designed specifically to make the most of their vacation in our
              wonderful territories.
            </p>

            <p>
              You can explore them the way you prefer, parking your car in our free, video-monitored private parking and
              using the <strong>Bike Rental</strong> service (on request, paid, external hotel service).
            </p>

            <p>
              If you love wellness, in our resort you will also find a <strong>Relax Area</strong>, where you can relax
              in our sauna, and treat yourself to moments of pampering with massages and treatments.
            </p>

            <p>
              Would you like a <strong>wine tasting in a cellar</strong>? Ask at reception to learn about the most
              beautiful and unique wineries in the area, some reachable even on foot.
            </p>

            <p>
              Shopping lovers will be happy to know that <strong>Villa I Barronci Resort & Spa</strong> is strategically
              located also from this point of view: in our area you will find{" "}
              <strong>Barberino Outlet, The Mall Luxury Outlet and Prada Outlet in Valdarno</strong>, all easily
              reachable.
            </p>

            <div className="bg-background p-8 rounded-lg mt-12">
              <h3 className="font-serif text-2xl text-foreground mb-6">Our services</h3>
              <ul className="space-y-3 text-muted-foreground">
                <li>✓ 24-hour reception</li>
                <li>✓ Check-in from 3pm to 9pm</li>
                <li>✓ Check-out by 10:30am</li>
                <li>✓ Express and private check-in and check-out</li>
                <li>✓ Night porter from 10pm</li>
                <li>✓ Free Wi-Fi throughout the property</li>
                <li>✓ Babysitting service (on request)</li>
                <li>✓ Room service</li>
                <li>✓ Luggage storage and concierge service</li>
                <li>✓ Laundry service with dry cleaning and ironing (on request, paid, external service)</li>
                <li>
                  ✓ <strong>Transfer with NCC service</strong> (on request, paid, external hotel service, to be booked
                  at least 2 days in advance)
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
