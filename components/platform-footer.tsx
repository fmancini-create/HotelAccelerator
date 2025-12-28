import { Building2, Shield } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

export function PlatformFooter() {
  return (
    <footer className="py-12 px-4 border-t border-white/10 bg-[#0a0a0a]" role="contentinfo">
      <div className="container mx-auto">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          {/* Logo HotelAccelerator */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="h-6 w-6 text-white" aria-hidden="true" />
              <span className="font-semibold text-white">HotelAccelerator</span>
            </div>
            <p className="text-sm text-gray-500">La piattaforma completa per hotel e strutture ricettive.</p>
          </div>

          {/* Prodotto */}
          <div>
            <h3 className="font-medium mb-4 text-white">Prodotto</h3>
            <ul className="space-y-2 text-sm text-gray-500">
              <li>
                <Link href="/features/cms" className="hover:text-white transition-colors">
                  CMS
                </Link>
              </li>
              <li>
                <Link href="/features/crm" className="hover:text-white transition-colors">
                  CRM
                </Link>
              </li>
              <li>
                <Link href="/features/email-marketing" className="hover:text-white transition-colors">
                  Email Marketing
                </Link>
              </li>
              <li>
                <Link href="/features/inbox-omnicanale" className="hover:text-white transition-colors">
                  Inbox Omnicanale
                </Link>
              </li>
              <li>
                <Link href="/features/analytics" className="hover:text-white transition-colors">
                  Analytics
                </Link>
              </li>
              <li>
                <Link href="/features/ai-assistant" className="hover:text-white transition-colors">
                  AI Assistant
                </Link>
              </li>
            </ul>
          </div>

          {/* Azienda */}
          <div>
            <h3 className="font-medium mb-4 text-white">Azienda</h3>
            <ul className="space-y-2 text-sm text-gray-500">
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  Termini di Servizio
                </Link>
              </li>
            </ul>
          </div>

          {/* Contatti */}
          <div>
            <h3 className="font-medium mb-4 text-white">Contatti</h3>
            <ul className="space-y-2 text-sm text-gray-500">
              <li>
                <Link href="/request-access" className="hover:text-white transition-colors">
                  Richiedi Demo
                </Link>
              </li>
              <li>
                <Link href="/super-admin/login" className="hover:text-white transition-colors flex items-center gap-1">
                  <Shield className="h-3 w-3" aria-hidden="true" />
                  Area Manager
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Separatore */}
        <div className="border-t border-white/10 pt-8">
          {/* 4Bid Company Info */}
          <div className="flex flex-col items-center gap-6">
            {/* Logo 4Bid */}
            <div className="flex items-center gap-3">
              <Link
                href="https://www.4bid.it"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 hover:opacity-80 transition-opacity"
              >
                <Image src="/images/4bid-logo.png" alt="4Bid S.r.l." width={40} height={40} className="opacity-90" />
                <span className="text-sm text-gray-400">
                  Un prodotto di <span className="text-amber-500 font-medium">4Bid S.r.l.</span>
                </span>
              </Link>
            </div>

            {/* Dati aziendali */}
            <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 text-xs text-gray-500 text-center">
              <span>Sede legale: Via Sorripa, 10 - 50026 San Casciano in Val di Pesa (FI)</span>
              <span className="hidden md:inline text-gray-700">|</span>
              <span>P. IVA: 06241710489</span>
            </div>

            {/* Copyright */}
            <p className="text-xs text-gray-600">
              © {new Date().getFullYear()} 4Bid S.r.l. – Tutti i diritti riservati
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
