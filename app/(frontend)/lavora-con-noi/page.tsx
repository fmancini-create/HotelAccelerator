import type { Metadata } from "next"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { ChevronDown } from "lucide-react"

export const metadata: Metadata = {
  title: "Lavora con Noi - Villa I Barronci Resort & Spa",
  description:
    "Opportunità di lavoro a Villa I Barronci. Entra a far parte del nostro team e lavora in un resort di charme nel cuore del Chianti.",
}

export default function LavoraConNoiPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <section className="relative h-screen flex items-center justify-center text-center text-white">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url('https://www.ibarronci.com/wp-content/uploads/2023/07/staff-villa-barronci.jpg')",
          }}
        >
          <div className="absolute inset-0 bg-black/30" />
        </div>

        <div className="relative z-10 max-w-4xl px-4">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif mb-6">Lavora con Noi</h1>
          <p className="text-xl md:text-2xl font-light">Entra a far parte del team di Villa I Barronci</p>
        </div>
      </section>

      <section className="bg-[#f5f1ed] py-20">
        <div className="container mx-auto px-6">
          <div className="flex justify-center mb-8">
            <ChevronDown className="w-8 h-8 text-[#8b7355]" />
          </div>

          <div className="max-w-4xl mx-auto text-center mb-12">
            <div className="w-20 h-px bg-[#8b7355] mx-auto mb-8" />
            <h2 className="text-4xl md:text-5xl font-serif mb-8 text-balance">Opportunità di Lavoro</h2>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Unisciti al nostro team e lavora in un ambiente unico nel cuore del Chianti
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-6 text-muted-foreground leading-relaxed text-pretty">
            <p>
              Villa I Barronci è sempre alla ricerca di persone appassionate e motivate che desiderano lavorare nel
              settore dell'ospitalità di lusso. Se ami il contatto con gli ospiti, hai esperienza nel settore
              alberghiero e vuoi far parte di un team dinamico in un contesto unico, inviaci il tuo curriculum.
            </p>
            <p>
              Cerchiamo professionisti per diverse posizioni: receptionist, personale di sala, addetti alle pulizie,
              operatori spa e wellness, chef e aiuto cuochi. Valutiamo anche candidature spontanee per inserimenti
              futuri.
            </p>
            <p className="font-semibold text-center pt-6">
              Invia il tuo CV a:{" "}
              <a href="mailto:jobs@ibarronci.com" className="text-[#8b7355] hover:underline">
                jobs@ibarronci.com
              </a>
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
