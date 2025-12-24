import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import Image from "next/image"

export default function RistorantePage() {
  return (
    <main className="min-h-screen bg-background">
      <Navigation />

      {/* Hero Section */}
      <section className="relative h-[60vh] min-h-[500px]">
        <Image
          src="https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0033-copia.webp"
          alt="Ristorante da Tiberio"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-4xl md:text-6xl font-serif text-white mb-4">Ristorante da Tiberio</h1>
          <p className="text-xl md:text-2xl text-white/90 max-w-2xl">
            La vacanza in Toscana ha trovato la sua migliore cucina
          </p>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-16 px-4 md:px-8 max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-serif text-foreground mb-8">
          Ristorante da Tiberio, a Villa I Barronci
        </h2>

        <div className="prose prose-lg max-w-none text-muted-foreground space-y-6">
          <p>
            Sulla <strong>terrazza panoramica di Villa I Barronci Resort & Spa</strong> avrai la possibilità di gustare
            sia i piatti della <strong>cucina toscana</strong> sia il meglio della <strong>cucina mediterranea</strong>:
            il ristorante "da Tiberio a San Casciano", <strong>è aperto tutti i giorni in estate</strong>; in{" "}
            <strong>inverno effettua un giorno di chiusura il martedì</strong>.
          </p>

          <p>
            Il ristorante, da Tiberio a San Casciano, viene proposta una cucina mediterranea con prodotti a km zero e
            rigorosamente biologici, con verdure provenienti in parte dall'H-orto di Grace. I piatti e le ricette
            dell'espressione più tipica toscana sono rivisitati in chiave moderna per esaltare in maniera ancora
            maggiore l'assoluta qualità dei prodotti e delle materie prime, tutti bio e a km 0, come la nostra carne
            proveniente da allevamenti certificati o le verdure biologiche a Km 0.
          </p>

          <p>
            I nostri chef avranno inoltre cura di preparare, su segnalazione, menù speciali per diete specifiche,
            intolleranze o allergie.
          </p>

          <p>
            Anche la carta dei vini ha l'obiettivo di esaltare le eccellenze territoriali, con una selezione delle
            etichette toscane più prestigiose: Chianti Classico, Chianti Riserva e Supertuscans come Tignanello, Solaia
            e Sassicaia. Completano la cantina il Brunello di Montalcino, il Nobile di Montepulciano ed una piccola
            selezione di bianchi.
          </p>
        </div>

        <div className="mt-12 flex justify-center">
          <Button asChild size="lg" className="bg-[#8b7355] hover:bg-[#8b7355]/90 text-white">
            <a href="https://datiberio.com" target="_blank" rel="noopener noreferrer">
              VAI AL SITO DEL RISTORANTE
            </a>
          </Button>
        </div>
      </section>

      <Footer />
    </main>
  )
}
