import Image from "next/image"

/**
 * Marchio HotelAccelerator — FONTE UNICA.
 *
 * Prima di questo componente il marchio era disegnato in tre modi diversi e
 * incompatibili, sparsi per il codice:
 *   1. un quadratino con le lettere "HA"   (intestazioni del backend)
 *   2. l'icona generica `Building2` di Lucide + il nome  (pagine pubbliche)
 *   3. solo il nome scritto                 (gate di accesso)
 * Nessuno dei tre era il logo vero, che pure era gia' in `public/` e non era
 * riferito da nessuna riga di codice.
 *
 * Le tre varianti qui sotto coprono quei tre usi, cosi' un cambio di logo
 * futuro si fa in UN punto solo.
 *
 * ATTENZIONE: questo e' il marchio della PIATTAFORMA. I siti dei clienti
 * (es. Villa I Barronci) hanno il proprio logo e NON devono usare questo
 * componente.
 */

const MARK_SRC = "/logo-hotelaccelerator-mark.png"
const FULL_SRC = "/logo-hotelaccelerator-full.png"

/** Solo il simbolo (razzo + istogramma). Per intestazioni compatte e avatar. */
export function HotelAcceleratorMark({
  className = "h-8 w-8",
  priority = false,
}: {
  className?: string
  priority?: boolean
}) {
  return (
    <Image
      src={MARK_SRC || "/placeholder.svg"}
      alt=""
      width={512}
      height={512}
      priority={priority}
      className={`${className} object-contain`}
      aria-hidden
    />
  )
}

/**
 * Simbolo + nome affiancati: l'uso normale nelle barre di navigazione.
 * Il nome resta TESTO (non un'immagine) perche' deve restare selezionabile,
 * leggibile dagli screen reader e nitido a ogni densita' di schermo.
 */
export function HotelAcceleratorLogo({
  className = "",
  markClassName = "h-8 w-8",
  textClassName = "font-semibold text-foreground text-sm",
  showName = true,
  priority = false,
}: {
  className?: string
  markClassName?: string
  textClassName?: string
  showName?: boolean
  priority?: boolean
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <HotelAcceleratorMark className={markClassName} priority={priority} />
      {showName ? (
        <span className={textClassName}>HotelAccelerator</span>
      ) : (
        <span className="sr-only">HotelAccelerator</span>
      )}
    </span>
  )
}

/**
 * Logo completo (simbolo sopra, scritta sotto), come fornito dal cliente.
 * Per le schermate in cui il marchio e' il soggetto: gate di accesso, pagine
 * di errore, stampe.
 */
export function HotelAcceleratorLockup({
  className = "h-20 w-auto",
  priority = false,
}: {
  className?: string
  priority?: boolean
}) {
  return (
    <Image
      src={FULL_SRC || "/placeholder.svg"}
      alt="HotelAccelerator"
      width={963}
      height={881}
      priority={priority}
      className={`${className} object-contain`}
    />
  )
}
