import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Information Request - Villa I Barronci Resort & Spa",
  description:
    "Contact us for information about your stay at Villa I Barronci. We are happy to answer all your questions.",
  alternates: {
    canonical: "/en/information-request",
    languages: { it: "/richiesta-informazioni", de: "/de/informationsanfrage", fr: "/fr/demande-informations" },
  },
}

export default function InformationRequestPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <section className="relative h-[40vh] w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url(https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0044.webp)",
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <h1 className="font-serif text-5xl md:text-7xl mb-6">CONTACT US</h1>
          <p className="text-xl md:text-2xl max-w-3xl">We Are Here for You</p>
        </div>
      </section>

      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-2xl">
          <h2 className="font-serif text-4xl text-foreground mb-8 text-center">Information Request</h2>
          <form className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input placeholder="Name *" required className="h-12" />
              <Input placeholder="Surname *" required className="h-12" />
            </div>
            <Input type="email" placeholder="Email *" required className="h-12" />
            <Input type="tel" placeholder="Phone" className="h-12" />
            <Textarea placeholder="Your message *" required className="min-h-[150px]" />
            <div className="flex justify-center">
              <Button
                type="submit"
                size="lg"
                className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white px-12 py-6 text-lg"
              >
                SEND REQUEST
              </Button>
            </div>
          </form>
        </div>
      </section>
      <Footer />
    </div>
  )
}
