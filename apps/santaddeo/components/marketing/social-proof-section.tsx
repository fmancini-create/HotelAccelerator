import { ArrowRight, Quote, Star } from "lucide-react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"

/**
 * Social Proof - audit punto 1 (priorita' ALTA).
 *
 * Mostra:
 *  - Riga di "logo" strutture (wordmark testuale, sostituibili con SVG reali)
 *  - 3 testimonial con case study e numero concreto (RevPAR/Occ/ADR)
 *
 * NOTA SOSTITUZIONI: tutti i nomi e numeri qui sono PLACEHOLDER strutturali.
 * Puoi:
 *  - Sostituire i wordmark con tag <img src="/logos/..." /> quando avrai gli SVG
 *  - Cambiare i numeri delle quote dopo la conferma dai clienti reali
 *  - Sostituire l'avatar placeholder con una foto reale (rispettando privacy)
 */
export function SocialProofSection() {
  // 13/05/2026: lista clienti aggiornata su richiesta. "Hotel Massabò" era un
  // errore — la struttura corretta e' "Tenuta Massabò". Aggiunte 8 strutture
  // reali; la frase "e tanti altri" e' resa come sottotitolo fuori griglia.
  const wordmarks = [
    "Villa I Barronci",
    "Hotel Cavallino",
    "Podere Casanova",
    "Tenuta Massabò",
    "Fattoria le Mandrie",
    "Hotel Massimo",
    "La Vecchia Scuola",
    "Casa Vacanze Rondini Blu",
    "Blue Relais",
    "Villa d'Arte Agriresort",
    "Palazzo Tempi",
    "Casa Irene",
  ]

  // TODO: sostituire con testimonianze reali raccolte (anche brevi 2-3 righe).
  // Mantieni la struttura: ruolo, struttura, citta', quote, metrica concreta.
  const testimonials = [
    {
      name: "Filippo C.",
      role: "Direttore",
      property: "Hotel boutique - Toscana",
      rooms: "24 camere",
      quote:
        "In 6 settimane abbiamo recuperato il 18% di RevPAR. Il semaforo benchmark ci ha fatto capire dove eravamo sotto-prezzo nei weekend di bassa stagione.",
      metric: "+18% RevPAR",
      timeframe: "6 settimane",
    },
    {
      name: "Marco T.",
      role: "Revenue Manager",
      property: "Agriturismo - Chianti",
      rooms: "12 camere",
      quote:
        "Prima usavo Excel e correggevo le tariffe ogni weekend. Adesso AutoPilot le ottimizza ogni notte e io controllo solo gli alert.",
      metric: "10 ore/sett risparmiate",
      timeframe: "dopo 2 mesi",
    },
    {
      name: "Sara M.",
      role: "Proprietaria",
      property: "B&B con appartamenti - Umbria",
      rooms: "8 unità",
      quote:
        "Pensavo che un RMS fosse solo per i grandi hotel. SANTADDEO mi dice in tempo reale quando Booking ha tariffe disallineate dal mio sito.",
      metric: "+12% ADR diretto",
      timeframe: "in 3 mesi",
    },
  ]

  return (
    <section className="border-y bg-white py-16">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-5xl">
          <p className="mb-8 text-center text-sm font-medium uppercase tracking-wider text-gray-500">
            Strutture che gestiscono le tariffe con SANTADDEO
          </p>

          {/* Wordmark grid - placeholder per i loghi reali */}
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {wordmarks.map((name) => (
              <div
                key={name}
                className="flex h-14 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-600 md:text-sm"
              >
                {name}
              </div>
            ))}
          </div>
          <p className="mb-14 text-center text-sm italic text-gray-500">
            …e tanti altri
          </p>

          {/* Testimonial cards */}
          <div className="grid gap-6 md:grid-cols-3">
            {testimonials.map((t) => (
              <Card
                key={t.name}
                className="relative border border-gray-200 transition-all hover:border-emerald-300 hover:shadow-md"
              >
                <CardContent className="flex h-full flex-col p-6">
                  <Quote className="mb-4 h-7 w-7 text-emerald-500" aria-hidden="true" />
                  <p className="mb-5 flex-1 text-sm leading-relaxed text-gray-700">
                    &ldquo;{t.quote}&rdquo;
                  </p>

                  <div className="mb-4 inline-flex items-center gap-2 self-start rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    <span>{t.metric}</span>
                    <span className="text-emerald-400">·</span>
                    <span className="font-normal">{t.timeframe}</span>
                  </div>

                  <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
                    {/* Avatar placeholder: cerchio con iniziale. TODO: sostituire con <img> reale. */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-sm font-bold text-white">
                      {t.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">{t.name}</div>
                      <div className="truncate text-xs text-gray-500">
                        {t.role} · {t.property} · {t.rooms}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Star rating overall */}
          <div className="mt-10 flex flex-col items-center justify-center gap-2 text-center md:flex-row md:gap-4">
            <div className="flex items-center gap-1" aria-label="Valutazione media 4.8 su 5">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <span className="text-sm font-medium text-gray-700">
              4.8/5 di soddisfazione media — su 70+ strutture attive
            </span>
          </div>

          {/* CTA intermedio - audit feedback: dopo i testimonial l'utente
              deve avere un punto d'azione immediato senza dover scrollare
              fino al CTA finale in fondo alla pagina. */}
          <div className="mt-8 flex flex-col items-center justify-center gap-2">
            <Link
              href="/auth/sign-up"
              className="group inline-flex h-12 items-center gap-2 rounded-full bg-emerald-600 px-7 text-base font-semibold text-white shadow-md transition-all hover:bg-emerald-700 hover:shadow-lg"
            >
              Inizia gratis
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <p className="text-xs text-gray-500">
              Nessuna carta di credito richiesta · Setup in 30 secondi
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
