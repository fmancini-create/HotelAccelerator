import { Sparkles } from "lucide-react"

/**
 * Urgency Banner - audit punto 6 (priorita' MEDIA).
 *
 * Striscia sopra l'hero che comunica una promo / scarcity reale.
 * IMPORTANTE: il testo qui dev'essere VERO e mantenibile. Se la promo finisce,
 * va rimosso (no fake urgency). Modifica `OFFER_DEADLINE` per gestire la data
 * di fine campagna - quando passata, il banner non viene renderizzato.
 *
 * Esempio default: "primi 100 iscritti ricevono setup gratuito personalizzato".
 * Il counter mostra quanti slot restano (PLACEHOLDER da collegare a un counter
 * reale dal DB se vuoi attivarlo - per ora numero hard-coded).
 */
export function UrgencyBanner() {
  // TODO: sostituire con la deadline reale della tua promo. Se la data e' nel
  // passato, il banner viene nascosto automaticamente (no fake urgency).
  const OFFER_DEADLINE = new Date("2026-06-30T23:59:59")

  if (Date.now() > OFFER_DEADLINE.getTime()) return null

  // TODO: collegare a un counter reale (es. SELECT COUNT(*) FROM organizations
  // WHERE created_at > '2026-05-01'). Per ora: numero indicativo.
  const SLOTS_LEFT = 37

  return (
    <div className="bg-amber-500 text-amber-950">
      <div className="container mx-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-6 py-2.5 text-center text-sm font-medium">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        <span>
          <strong>Promo lancio:</strong> primi 100 iscritti ricevono setup &amp; onboarding
          personalizzato gratis
        </span>
        <span className="hidden text-amber-900 md:inline">·</span>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
          Restano {SLOTS_LEFT} posti
        </span>
      </div>
    </div>
  )
}
