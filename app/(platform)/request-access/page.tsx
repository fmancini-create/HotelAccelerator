import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { ArrowRight, CheckCircle2, Mail, Phone, Building, User } from "lucide-react"
import { PlatformFooter } from "@/components/platform-footer"
import { HotelAcceleratorMark } from "@/components/brand/hotel-accelerator-logo"

export const metadata: Metadata = {
  title: "Richiedi Demo Gratuita - HotelAccelerator",
  description:
    "Richiedi una demo gratuita di HotelAccelerator. Scopri come aumentare le prenotazioni dirette del tuo hotel con CRM, CMS, Email Marketing e AI Assistant.",
  keywords: ["demo hotel software", "software gestionale hotel", "crm hotel demo", "prenotazioni dirette hotel"],
  openGraph: {
    title: "Richiedi Demo Gratuita - HotelAccelerator",
    description: "Scopri come aumentare le prenotazioni dirette del tuo hotel. Demo gratuita senza impegno.",
    type: "website",
  },
  alternates: {
    canonical: "https://hotelaccelerator.com/request-access",
  },
}

const benefits = [
  "Demo personalizzata per la tua struttura",
  "Nessuna carta di credito richiesta",
  "Supporto dedicato in italiano",
  "Setup assistito incluso",
]

export default function RequestAccessPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Schema.org */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "Richiedi Demo - HotelAccelerator",
            description: "Richiedi una demo gratuita di HotelAccelerator",
            url: "https://hotelaccelerator.com/request-access",
          }),
        }}
      />

      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <nav className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <HotelAcceleratorMark className="h-8 w-8" priority />
            <span className="text-xl font-semibold tracking-tight">HotelAccelerator</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                Accedi
              </Button>
            </Link>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 pt-32 pb-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            {/* Left Column - Info */}
            <div>
              <Link href="/" className="mx-auto mb-6 flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <ArrowRight className="h-4 w-4 rotate-180" />
                Torna alla home
              </Link>

              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">Richiedi una Demo Gratuita</h1>

              <p className="text-lg text-muted-foreground mb-8">
                Scopri come HotelAccelerator può aiutarti ad aumentare le prenotazioni dirette e ottimizzare la gestione
                del tuo hotel.
              </p>

              {/* Benefits */}
              <ul className="space-y-4 mb-12">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-ha-brand flex-shrink-0" />
                    <span className="text-muted-foreground">{benefit}</span>
                  </li>
                ))}
              </ul>

              {/* Contact Info */}
              <div className="p-6 rounded-2xl bg-secondary/50 border border-border">
                <h3 className="font-semibold mb-4">Preferisci parlare con noi?</h3>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-ha-brand" />
                    <a href="mailto:info@4bid.it" className="hover:text-foreground transition-colors">
                      info@4bid.it
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Form */}
            <div className="p-8 rounded-3xl bg-secondary/50 border border-border">
              <h2 className="text-2xl font-semibold mb-6">Compila il modulo</h2>

              <form className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="text-muted-foreground">
                      Nome *
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="firstName"
                        placeholder="Mario"
                        required
                        className="pl-10 bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground focus:border-ha-brand"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="text-muted-foreground">
                      Cognome *
                    </Label>
                    <Input
                      id="lastName"
                      placeholder="Rossi"
                      required
                      className="bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground focus:border-ha-brand"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-muted-foreground">
                    Email aziendale *
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="mario@hotel.com"
                      required
                      className="pl-10 bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground focus:border-ha-brand"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-muted-foreground">
                    Telefono
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+39 055 123 4567"
                      className="pl-10 bg-secondary/50 border border-border text-foreground placeholder:text-muted-foreground focus:border-ha-brand"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company" className="text-muted-foreground">
                    Nome struttura *
                  </Label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="company"
                      placeholder="Hotel Bella Vista"
                      required
                      className="pl-10 bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground focus:border-ha-brand"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rooms" className="text-muted-foreground">
                    Numero camere
                  </Label>
                  <select
                    id="rooms"
                    className="w-full h-10 px-3 rounded-md bg-secondary/50 border border-border text-foreground focus:border-ha-brand focus:outline-none"
                  >
                    <option value="" className="bg-background">
                      Seleziona...
                    </option>
                    <option value="1-10" className="bg-background">
                      1-10 camere
                    </option>
                    <option value="11-30" className="bg-background">
                      11-30 camere
                    </option>
                    <option value="31-50" className="bg-background">
                      31-50 camere
                    </option>
                    <option value="51-100" className="bg-background">
                      51-100 camere
                    </option>
                    <option value="100+" className="bg-background">
                      Oltre 100 camere
                    </option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message" className="text-muted-foreground">
                    Messaggio (opzionale)
                  </Label>
                  <Textarea
                    id="message"
                    placeholder="Raccontaci le tue esigenze..."
                    rows={4}
                    className="bg-secondary/50 border-border text-foreground placeholder:text-muted-foreground focus:border-ha-brand resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full bg-ha-brand text-ha-brand-foreground hover:bg-ha-brand/90 font-semibold gap-2"
                >
                  Richiedi Demo Gratuita
                  <ArrowRight className="h-4 w-4" />
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Inviando questo modulo accetti la nostra{" "}
                  <Link href="/privacy" className="text-ha-brand hover:underline">
                    Privacy Policy
                  </Link>
                </p>
              </form>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <PlatformFooter />
    </div>
  )
}
