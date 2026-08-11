/**
 * Marchio HotelAccelerator — FONTE UNICA.
 *
 * Prima di questo componente il marchio era disegnato in quattro modi diversi
 * e incompatibili, sparsi per il codice:
 *   1. un quadratino con le lettere "HA"    (intestazioni del backend)
 *   2. l'icona generica `Building2` di Lucide + il nome  (pagine pubbliche)
 *   3. la stessa icona generica nel footer   (9 pagine pubbliche)
 *   4. solo il nome scritto                  (gate di accesso)
 * Nessuno dei quattro era il logo vero, che pure era gia' in `public/` e non
 * era riferito da nessuna riga di codice.
 *
 * ATTENZIONE: questo e' il marchio della PIATTAFORMA. I siti dei clienti
 * (es. Villa I Barronci) hanno il proprio logo e NON devono usare questo
 * componente.
 *
 * -------------------------------------------------------------------------
 * PERCHE' <img> E NON next/image
 * -------------------------------------------------------------------------
 * `next.config.mjs` imposta `images.unoptimized: true`, quindi next/image
 * consegna il file grezzo e NON genera alcun srcset — verificato nel DOM:
 * l'attributo era vuoto e il browser scaricava il PNG da 512px per mostrarlo
 * a 32px, riducendolo di 16 volte in un colpo solo. Da li' l'aspetto
 * impastato.
 *
 * Qui le misure disponibili sono dichiarate a mano con srcSet + sizes: il
 * browser scarica quella piu' vicina e riduce al massimo di 2x, restando
 * nitido anche sugli schermi ad alta densita'. Non tocco il flag globale
 * perche' vale per TUTTE le immagini, comprese quelle dei siti dei clienti.
 */

/** Misure generate in public/ (vedi .v0/imgtool/generate2.mjs). */
const MARK_SIZES = [32, 64, 96, 128, 192, 256, 512] as const
const LOCKUP_HEIGHTS = [96, 192, 288, 576] as const

/** Proporzione MISURATA del logo completo dopo il ritaglio stretto. */
const LOCKUP_RATIO = 1.0931

const markSrcSet = MARK_SIZES.map((s) => `/logo-ha-mark-${s}.png ${s}w`).join(", ")
const lockupSrcSet = LOCKUP_HEIGHTS.map((h) => `/logo-ha-lockup-${h}.png ${Math.round(h * LOCKUP_RATIO)}w`).join(", ")

/**
 * Solo il simbolo (razzo + istogramma). Per intestazioni compatte e avatar.
 *
 * `sizes` deve corrispondere alla larghezza REALE di resa, altrimenti il
 * browser sceglie un file piu' grande del necessario (spreco) o piu' piccolo
 * (sfocato). Per questo chi lo usa a una misura diversa dal predefinito la
 * dichiara esplicitamente.
 */
export function HotelAcceleratorMark({
  className = "h-8 w-8",
  sizes = "32px",
  priority = false,
}: {
  className?: string
  sizes?: string
  priority?: boolean
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- vedi nota in testa al file
    <img
      src="/logo-ha-mark-128.png"
      srcSet={markSrcSet}
      sizes={sizes}
      alt=""
      width={512}
      height={512}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      className={`${className} object-contain`}
      aria-hidden="true"
    />
  )
}

/**
 * Simbolo + nome affiancati: l'uso normale nelle barre di navigazione.
 * Il nome resta TESTO (non un'immagine) perche' cosi' e' selezionabile,
 * leggibile dagli screen reader e nitido a ogni densita' di schermo.
 */
export function HotelAcceleratorLogo({
  className = "",
  markClassName = "h-8 w-8",
  markSizes = "32px",
  textClassName = "font-semibold text-foreground text-sm",
  showName = true,
  priority = false,
}: {
  className?: string
  markClassName?: string
  markSizes?: string
  textClassName?: string
  showName?: boolean
  priority?: boolean
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <HotelAcceleratorMark className={markClassName} sizes={markSizes} priority={priority} />
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
 * Per le schermate in cui il marchio E' il soggetto: gate di accesso, pagine
 * di errore, stampe.
 *
 * Va usato solo a misure generose: sotto i ~100px di altezza la scritta
 * incorporata diventa troppo piccola per restare leggibile, e in quel caso
 * conviene `HotelAcceleratorLogo` (simbolo + nome come testo vero).
 */
export function HotelAcceleratorLockup({
  className = "h-28 w-auto",
  sizes = "123px",
  priority = false,
}: {
  className?: string
  sizes?: string
  priority?: boolean
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- vedi nota in testa al file
    <img
      src="/logo-ha-lockup-288.png"
      srcSet={lockupSrcSet}
      sizes={sizes}
      alt="HotelAccelerator"
      width={630}
      height={576}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      className={`${className} object-contain`}
    />
  )
}
