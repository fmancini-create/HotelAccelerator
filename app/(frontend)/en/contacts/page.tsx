import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { MapPin, Phone, Mail, Clock } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Contacts - Villa I Barronci Resort & Spa",
  description:
    "Contact Villa I Barronci Resort & Spa in San Casciano Val di Pesa. Phone, email and address for information and reservations.",
  alternates: {
    canonical: "/en/contacts",
    languages: {
      it: "/contatti",
      de: "/de/kontakt",
      fr: "/fr/contact",
    },
  },
}

export default function ContactsPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navigation />

      <section className="py-16 px-4 md:px-8 max-w-6xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-serif text-foreground mb-8 text-center">Contact Us</h1>

        <div className="grid md:grid-cols-2 gap-12">
          <div>
            <h2 className="text-2xl font-serif text-foreground mb-6">Information</h2>

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <MapPin className="h-6 w-6 text-[#8b7355] mt-1" />
                <div>
                  <h3 className="font-semibold text-foreground">Address</h3>
                  <p className="text-muted-foreground">
                    Via Sorripa, 10
                    <br />
                    50026 San Casciano In Val Di Pesa (FI)
                    <br />
                    Italy
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <Phone className="h-6 w-6 text-[#8b7355] mt-1" />
                <div>
                  <h3 className="font-semibold text-foreground">Phone</h3>
                  <a href="tel:+39055820598" className="text-muted-foreground hover:text-foreground">
                    +39 055 820598
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <Mail className="h-6 w-6 text-[#8b7355] mt-1" />
                <div>
                  <h3 className="font-semibold text-foreground">Email</h3>
                  <a href="mailto:info@ibarronci.com" className="text-muted-foreground hover:text-foreground">
                    info@ibarronci.com
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <Clock className="h-6 w-6 text-[#8b7355] mt-1" />
                <div>
                  <h3 className="font-semibold text-foreground">Reception</h3>
                  <p className="text-muted-foreground">
                    Open 24 hours a day
                    <br />
                    Check-in: 3:00 PM - 9:00 PM
                    <br />
                    Check-out: by 10:30 AM
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="h-[400px] rounded-lg overflow-hidden">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2888.1234567890!2d11.1234567890!3d43.6543210987!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNDPCsDM5JzE1LjYiTiAxMcKwMDcnMjQuNCJF!5e0!3m2!1sen!2sit!4v1234567890"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-4">
          <Button asChild size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white">
            <a
              href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&lang=1"
              target="_blank"
              rel="noopener noreferrer"
            >
              BOOK NOW
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="tel:+39055820598">CALL US</a>
          </Button>
        </div>
      </section>

      <Footer />
    </main>
  )
}
