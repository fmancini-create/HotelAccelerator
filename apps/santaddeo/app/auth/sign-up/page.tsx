import type { Metadata } from "next"
import SignUpContent from "./sign-up-content"

export const metadata: Metadata = {
  title: "Registrati Gratis - Crea Account",
  description: "Crea il tuo account gratuito SANTADDEO e ottieni subito una dashboard KPI completa per la tua struttura ricettiva. Nessuna carta di credito richiesta.",
  // 20/05/2026: noindex coerente con la decisione documentata in
  // app/sitemap.ts (audit 13/05): le pagine di registrazione gated
  // non sono SEO. La sitemap NON include /auth/sign-up, ma il robots.txt
  // wildcard non la blocca esplicitamente; senza questo meta robots
  // Google la scopriva via link interni e la indicizzava sprecando
  // crawl budget.
  robots: { index: false, follow: true },
  alternates: { canonical: "https://www.santaddeo.com/auth/sign-up" },
  openGraph: {
    title: "Registrati Gratis | SANTADDEO Revenue Management",
    description: "Dashboard KPI gratuita per hotel, agriturismi, campeggi e B&B. Registrati in 30 secondi, nessuna carta richiesta.",
    url: "https://www.santaddeo.com/auth/sign-up",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Registrati Gratis | SANTADDEO",
    description: "Dashboard KPI gratuita per strutture ricettive. Registrati in 30 secondi.",
  },
}

export default function SignUpPage() {
  return <SignUpContent />
}
