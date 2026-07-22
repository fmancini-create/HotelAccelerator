import { Lock, Shield, Server } from "lucide-react"

/**
 * Trust Badges Row - audit feedback 13/05/2026 (priorita' BASSA, impatto MEDIO).
 *
 * Mostra:
 *  - Sicurezza tecnica (SSL, hosting EU)
 *  - Compliance (GDPR)
 *  - PMS integrati (wordmark testuali dei principali gestionali italiani)
 *
 * Non usa loghi raster esterni: solo wordmark in CSS per ridurre carico immagini
 * e mantenere autonomia (i nomi PMS sono fatti pubblici, non c'e' uso del logo
 * registrato del competitor).
 *
 * Posizionato sopra il Final CTA per disinnescare le obiezioni di sicurezza
 * proprio nel momento decisionale.
 */
export function TrustBadgesRow() {
  // TODO: sostituire questi wordmark con <img src="/integrations/scidoo.svg" />
  // quando avrai i loghi ufficiali rilasciati per uso marketing (chiedi agli
  // account manager dei PMS o usa solo i wordmark testuali).
  const pmsList = ["Scidoo", "5stelle*", "Bedzzle", "Cloudbeds", "Wubook", "Octorate"]

  return (
    <section className="border-t bg-white py-14" aria-label="Sicurezza, compliance e integrazioni">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-5xl">
          {/* Trust badges (security + compliance) */}
          <div className="mb-10 grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50/50 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
                <Lock className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">Connessione SSL/TLS</div>
                <div className="text-xs text-gray-600">Crittografia end-to-end su tutti i dati</div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50/50 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                <Shield className="h-5 w-5 text-blue-700" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">GDPR Compliant</div>
                <div className="text-xs text-gray-600">Dati conservati in Unione Europea</div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50/50 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                <Server className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">Backup giornalieri</div>
                <div className="text-xs text-gray-600">Audit log e ripristino punto-in-tempo</div>
              </div>
            </div>
          </div>

          {/* PMS integrations row */}
          <div className="text-center">
            <p className="mb-5 text-xs font-medium uppercase tracking-wider text-gray-500">
              Integrato nativamente con i principali gestionali italiani
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              {pmsList.map((pms) => (
                <div
                  key={pms}
                  className="flex h-12 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-center text-xs font-semibold text-gray-700 md:text-sm"
                >
                  {pms}
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-gray-500">
              Non vedi il tuo PMS? Contattaci, gestiamo nuove integrazioni su richiesta.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
