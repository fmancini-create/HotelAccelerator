import Navigation from "@/components/navigation"
import Footer from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronDown, Mail } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Newsletter - Resta aggiornato | Villa I Barronci Resort & Spa",
  description:
    "Iscriviti alla newsletter di Villa I Barronci per ricevere offerte esclusive, novità e promozioni speciali per il tuo soggiorno nel Chianti.",
}

export default function NewsletterPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      {/* Hero Section */}
      <section className="relative h-screen w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url(https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0044.webp)",
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <Mail className="w-16 h-16 mb-6" />
          <h1 className="font-serif text-5xl md:text-7xl mb-6">Newsletter</h1>
          <p className="text-xl md:text-2xl max-w-3xl">Resta aggiornato su offerte esclusive e novità</p>
        </div>
      </section>

      {/* Content Section */}
      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="flex justify-center mb-8">
            <ChevronDown className="w-8 h-8 text-muted-foreground" />
          </div>

          <div className="border-t border-muted mb-12" />

          <div className="max-w-2xl mx-auto">
            <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8 text-center">
              Iscriviti alla Newsletter
            </h2>

            <p className="text-lg text-muted-foreground mb-12 text-center">
              Ricevi in anteprima le nostre offerte speciali, le ultime novità dal resort e consigli esclusivi per
              scoprire al meglio il territorio del Chianti.
            </p>

            <div className="bg-card p-8 rounded-lg shadow-lg">
              <form className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
                    Nome
                  </label>
                  <Input id="name" type="text" placeholder="Il tuo nome" required />
                </div>

                <div>
                  <label htmlFor="surname" className="block text-sm font-medium text-foreground mb-2">
                    Cognome
                  </label>
                  <Input id="surname" type="text" placeholder="Il tuo cognome" required />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                    Email
                  </label>
                  <Input id="email" type="email" placeholder="la-tua-email@esempio.com" required />
                </div>

                <div className="flex items-start">
                  <input id="privacy" type="checkbox" className="mt-1 mr-3" required />
                  <label htmlFor="privacy" className="text-sm text-muted-foreground">
                    Acconsento al trattamento dei miei dati personali secondo la{" "}
                    <a
                      href="https://www.iubenda.com/privacy-policy/35594411"
                      className="underline hover:text-foreground"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Privacy Policy
                    </a>
                  </label>
                </div>

                <Button type="submit" size="lg" className="w-full bg-[#8b7355] hover:bg-[#8b7355]/90 text-white">
                  ISCRIVITI ALLA NEWSLETTER
                </Button>
              </form>
            </div>

            <div className="mt-12 grid md:grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-3xl font-bold text-[#8b7355] mb-2">Offerte Esclusive</div>
                <p className="text-sm text-muted-foreground">Promozioni riservate agli iscritti</p>
              </div>

              <div>
                <div className="text-3xl font-bold text-[#8b7355] mb-2">Eventi Speciali</div>
                <p className="text-sm text-muted-foreground">Degustazioni e esperienze uniche</p>
              </div>

              <div>
                <div className="text-3xl font-bold text-[#8b7355] mb-2">Consigli di Viaggio</div>
                <p className="text-sm text-muted-foreground">Scopri il Chianti con i nostri suggerimenti</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
