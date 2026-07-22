/**
 * Dizionario i18n per i widget embeddabili (recensioni + last minute).
 *
 * Contiene SOLO le stringhe di SISTEMA dei widget: i testi personalizzati
 * dall'hotel (titolo recensioni, messageTemplate e ctaLabel del last minute)
 * non vanno qui — restano as-is e si traduce solo il loro default.
 *
 * Iniettato come 2° argomento JSON nella funzione runtime serializzata degli
 * script /embed/santaddeo.js e /embed/reviews.js (niente import a runtime nel
 * browser dell'hotel). Vedi anche memory santaddeo-widgets-multilang.
 *
 * Placeholder supportati: roomsLeft -> {n}; dateRange -> {from}/{to}.
 */
export const WIDGET_I18N = {
  supported: ["it", "en", "de", "fr", "es"],
  fallback: "en",
  dict: {
    it: {
      reviewsCount: "recensioni",
      verified: "Recensioni verificate",
      lmDefault: "Offerta last minute {dates}",
      roomsLeft: "Ultime {n} camere",
      book: "Prenota ora",
      dateRange: "dal {from} al {to}",
    },
    en: {
      reviewsCount: "reviews",
      verified: "Verified reviews",
      lmDefault: "Last minute deal {dates}",
      roomsLeft: "Last {n} rooms",
      book: "Book now",
      dateRange: "from {from} to {to}",
    },
    de: {
      reviewsCount: "Bewertungen",
      verified: "Verifizierte Bewertungen",
      lmDefault: "Last-Minute-Angebot {dates}",
      roomsLeft: "Letzte {n} Zimmer",
      book: "Jetzt buchen",
      dateRange: "vom {from} bis {to}",
    },
    fr: {
      reviewsCount: "avis",
      verified: "Avis vérifiés",
      lmDefault: "Offre de dernière minute {dates}",
      roomsLeft: "Dernières {n} chambres",
      book: "Réserver",
      dateRange: "du {from} au {to}",
    },
    es: {
      reviewsCount: "reseñas",
      verified: "Reseñas verificadas",
      lmDefault: "Oferta de última hora {dates}",
      roomsLeft: "Últimas {n} habitaciones",
      book: "Reservar ahora",
      dateRange: "del {from} al {to}",
    },
  },
} as const
