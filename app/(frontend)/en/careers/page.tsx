import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Careers - Villa I Barronci Resort & Spa",
  description: "Join the Villa I Barronci team. Discover job opportunities in our resort in the heart of Chianti.",
  alternates: {
    canonical: "/en/careers",
    languages: { it: "/lavora-con-noi", de: "/de/karriere", fr: "/fr/carrieres" },
  },
}

export default function CareersPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <section className="relative h-[50vh] w-full">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url(https://ibarronci.com/wp-content/uploads/2023/08/Villa-I-Barronci-Panoramica.jpg)",
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white text-center px-4">
          <h1 className="font-serif text-5xl md:text-7xl mb-6">CAREERS</h1>
          <p className="text-xl md:text-2xl max-w-3xl">Join Our Team</p>
        </div>
      </section>

      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-8 text-center">Work With Us</h2>
          <div className="space-y-6 text-muted-foreground leading-relaxed mb-12">
            <p>
              Villa I Barronci is always looking for passionate and talented people to join our team. If you love
              hospitality and want to work in a unique environment surrounded by the beauty of Chianti, this is the
              place for you.
            </p>
            <p>Send us your resume to discover current job opportunities and become part of our family.</p>
          </div>
          <div className="flex justify-center">
            <Button size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white px-12 py-6 text-lg" asChild>
              <a href="mailto:hr@ibarronci.com">SEND YOUR CV</a>
            </Button>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  )
}
