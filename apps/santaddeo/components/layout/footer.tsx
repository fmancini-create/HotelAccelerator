import Link from "next/link"
import Image from "next/image"
import { Linkedin, Facebook } from "lucide-react"

export function Footer() {
  return (
    <footer className="border-t bg-gray-50 py-12">
      <div className="container mx-auto px-6">
        {/*
          SEO 13/05/2026: aggiunta colonna "Risorse" per disinnescare le
          pagine orfane segnalate da Google Search Console.
          Prima di questo fix /blog, /seo/faq-santaddeo e
          /seo/cos-e-revenue-management non avevano alcun link globale dal
          footer. Erano raggiungibili solo navigando dentro al blog index,
          il che ne abbatte l'autorita' interna percepita da Google.
          Layout: 6 colonne su lg per ospitare brand + 5 sezioni.
        */}
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-6">
          <div>
            <h4 className="font-bold text-gray-900 mb-4">SANTADDEO</h4>
            <p className="text-sm text-muted-foreground">
              Il Revenue Management System che trasforma i dati in crescita
            </p>
          </div>
          <div>
            <h5 className="font-semibold text-gray-900 mb-4">Prodotto</h5>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/features" className="hover:text-gray-900">
                  Funzionalita
                </Link>
              </li>
              <li>
                <Link href="/integrazioni" className="hover:text-gray-900">
                  Gestionali Integrati
                </Link>
              </li>
              <li>
                <Link href="/upgrade/hotel-accelerator" className="hover:text-gray-900">
                  Hotel Accelerator
                </Link>
              </li>
              <li>
                <Link href="/request-info" className="hover:text-gray-900">
                  Richiedi Info
                </Link>
              </li>
            </ul>
          </div>
          {/*
            Sezione Soluzioni: linka tutte le landing pages tematiche.
            Migliora SEO interno (le landing erano "orfane" rispetto al
            footer globale) e aiuta i visitatori a scoprirle da qualsiasi
            pagina del sito.
          */}
          <div>
            <h5 className="font-semibold text-gray-900 mb-4">Soluzioni</h5>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/landing/dashboard-gratuita" className="hover:text-gray-900">
                  Dashboard Gratuita
                </Link>
              </li>
              <li>
                <Link href="/landing/guard" className="hover:text-gray-900">
                  Guard - Stop OTA Furbe
                </Link>
              </li>
              <li>
                <Link href="/landing/autopilot" className="hover:text-gray-900">
                  AutoPilot - Pricing Automatico
                </Link>
              </li>
              <li>
                <Link href="/landing/vendita" className="hover:text-gray-900">
                  +20% Fatturato in 30 giorni
                </Link>
              </li>
              <li>
                <Link href="/landing/agriturismi" className="hover:text-gray-900">
                  Agriturismi e B&amp;B
                </Link>
              </li>
              <li>
                <Link href="/landing/recupera-prenotazioni" className="hover:text-gray-900">
                  Recupera Prenotazioni Perse
                </Link>
              </li>
              <li>
                <Link href="/landing/performance-ota" className="hover:text-gray-900">
                  Performance OTA
                </Link>
              </li>
              <li>
                <Link href="/landing/recensioni" className="hover:text-gray-900">
                  Recensioni e Reputazione AI
                </Link>
              </li>
              <li>
                <Link href="/landing/variabili-personalizzate" className="hover:text-gray-900">
                  Variabili Personalizzate
                </Link>
              </li>
            </ul>
          </div>
          {/*
            Risorse: blog index + articolo pillar + 2 pagine SEO informazionali.
            Queste 4 risorse coprono le query informazionali long-tail
            ("cos'e' revenue management", "FAQ santaddeo", "software RMS hotel
            italia") e devono essere raggiungibili da ogni pagina del sito per
            ricevere link interni globali, non solo dal blog index.
          */}
          <div>
            <h5 className="font-semibold text-gray-900 mb-4">Risorse</h5>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/blog" className="hover:text-gray-900">
                  Blog
                </Link>
              </li>
              <li>
                <Link
                  href="/blog/software-revenue-management-hotel-italia"
                  className="hover:text-gray-900"
                >
                  Guida software RMS Italia
                </Link>
              </li>
              <li>
                <Link href="/seo/cos-e-revenue-management" className="hover:text-gray-900">
                  Cos&apos;e&apos; il Revenue Management
                </Link>
              </li>
              <li>
                <Link href="/seo/faq-santaddeo" className="hover:text-gray-900">
                  FAQ Santaddeo
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h5 className="font-semibold text-gray-900 mb-4">Azienda</h5>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/about" className="hover:text-gray-900">
                  Chi Siamo
                </Link>
              </li>
              <li>
                <Link href="/partner" className="hover:text-gray-900">
                  Programma Partner
                </Link>
              </li>
              <li>
                <Link href="/parlano-di-noi" className="hover:text-gray-900">
                  Parlano di noi
                </Link>
              </li>
              <li>
                <Link href="/request-info" className="hover:text-gray-900">
                  Contatti
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h5 className="font-semibold text-gray-900 mb-4">Legale</h5>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/privacy" className="hover:text-gray-900">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/termini" className="hover:text-gray-900">
                  Termini di Servizio
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Powered by</span>
              <img src="/logo-4bid.png" alt="4 BID S.r.l." width={70} height={23} className="opacity-80" />
            </div>
            <div className="text-center text-sm text-muted-foreground">
              <p className="font-medium text-gray-700">4 BID S.r.l.</p>
              <p>Via Sorripa, 10 – 50026 – San Casciano in Val di Pesa (FI)</p>
              <p>P.I. 06241710489</p>
            </div>
            {/*
              Profili social: Facebook punta alla pagina Santaddeo (prodotto),
              LinkedIn punta alla company page 4 BID (azienda che produce
              Santaddeo). target="_blank" + rel="noopener noreferrer" per
              sicurezza e compatibilita' SEO.
            */}
            <div className="flex items-center gap-2" aria-label="Profili social">
              <Link
                href="https://www.facebook.com/santaddeo"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Pagina Facebook Santaddeo"
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-gray-200 hover:text-gray-900"
              >
                <Facebook className="h-4 w-4" />
              </Link>
              <Link
                href="https://www.linkedin.com/company/4bid-srl"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Pagina LinkedIn 4 BID S.r.l."
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-gray-200 hover:text-gray-900"
              >
                <Linkedin className="h-4 w-4" />
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">© 2026 4 BID S.r.l. Tutti i diritti riservati.</p>
          </div>
        </div>
      </div>
    </footer>
  )
}
