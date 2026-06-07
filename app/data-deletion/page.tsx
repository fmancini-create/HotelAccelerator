import Link from "next/link"
import { Building2, ArrowLeft, Trash2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"

export const metadata = {
  title: "Eliminazione dei dati | HotelAccelerator",
  description:
    "Come richiedere l'eliminazione dei tuoi dati personali da HotelAccelerator, inclusi i dati ricevuti tramite WhatsApp e i servizi Meta.",
}

export default async function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const { code } = await searchParams

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Building2 className="h-7 w-7 text-white" />
            <span className="text-xl font-semibold tracking-tight">HotelAccelerator</span>
          </Link>
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white gap-2">
              <ArrowLeft className="h-4 w-4" />
              Torna alla Home
            </Button>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="pt-32 pb-20 px-4">
        <div className="container mx-auto max-w-3xl">
          <div className="flex items-center gap-3 mb-2">
            <Trash2 className="h-7 w-7 text-white" />
            <h1 className="text-3xl md:text-4xl font-bold">Eliminazione dei dati</h1>
          </div>
          <p className="text-gray-400 mb-12">Ultimo aggiornamento: 7 giugno 2026</p>

          {code && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mb-10">
              <p className="text-emerald-300 text-sm">
                Abbiamo ricevuto la tua richiesta di eliminazione. Codice di conferma:
              </p>
              <p className="font-mono text-lg text-white mt-1">{code}</p>
              <p className="text-gray-400 text-sm mt-2">
                Conserva questo codice: puoi citarlo nelle comunicazioni con il nostro supporto per verificare lo stato
                della richiesta.
              </p>
            </div>
          )}

          <div className="prose prose-invert prose-gray max-w-none space-y-8">
            <p className="text-gray-300 leading-relaxed">
              HotelAccelerator, piattaforma gestita da 4 Bid S.r.l., rispetta il tuo diritto alla cancellazione dei dati
              personali. Questa pagina spiega come richiedere l&apos;eliminazione dei dati raccolti, inclusi i messaggi e
              le informazioni ricevute tramite i canali di messaggistica integrati (WhatsApp Business tramite Meta).
            </p>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">Quali dati eliminiamo</h2>
              <ul className="list-disc list-inside space-y-2 text-gray-300">
                <li>Il tuo profilo di contatto (nome, numero di telefono, email)</li>
                <li>La cronologia delle conversazioni e dei messaggi associati al tuo contatto</li>
                <li>Eventuali metadati di consegna e lettura collegati ai tuoi messaggi</li>
                <li>I dati ricevuti dai servizi Meta (WhatsApp) collegati al tuo account</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">Come richiedere l&apos;eliminazione</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                Hai due modalità per richiedere la cancellazione dei tuoi dati:
              </p>
              <ol className="list-decimal list-inside space-y-3 text-gray-300">
                <li>
                  <span className="font-semibold text-white">Tramite Meta/Facebook:</span> rimuovendo
                  l&apos;applicazione dalle impostazioni del tuo account, Meta ci invia automaticamente una richiesta di
                  eliminazione e ti viene fornito un codice di conferma.
                </li>
                <li>
                  <span className="font-semibold text-white">Tramite email:</span> scrivendo a{" "}
                  <a href="mailto:privacy@hotelaccelerator.com" className="text-emerald-400 hover:underline">
                    privacy@hotelaccelerator.com
                  </a>{" "}
                  indicando il numero di telefono o l&apos;email associati ai tuoi dati.
                </li>
              </ol>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">Tempistiche</h2>
              <p className="text-gray-300 leading-relaxed">
                Le richieste vengono evase entro <span className="font-semibold text-white">30 giorni</span> dalla
                ricezione, salvo obblighi di legge che impongano la conservazione di alcuni dati (es. obblighi fiscali o
                contabili). Al completamento dell&apos;operazione i dati personali vengono cancellati o resi
                irreversibilmente anonimi.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-4">Contatti</h2>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-gray-300">
                <p className="font-semibold text-white">4 Bid S.r.l.</p>
                <p>Sede legale: Via Sorripa, 10 – 50026 San Casciano in Val di Pesa (FI) – Italia</p>
                <p>Partita IVA: 06241710489</p>
                <p className="flex items-center gap-2 mt-2">
                  <Mail className="h-4 w-4" />
                  <a href="mailto:privacy@hotelaccelerator.com" className="text-emerald-400 hover:underline">
                    privacy@hotelaccelerator.com
                  </a>
                </p>
              </div>
            </section>

            <p className="text-gray-400 text-sm">
              Per maggiori informazioni sul trattamento dei dati personali consulta la nostra{" "}
              <Link href="/privacy" className="text-emerald-400 hover:underline">
                Informativa sulla Privacy
              </Link>
              .
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-white/10">
        <div className="container mx-auto text-center text-sm text-gray-500">
          © 2026 HotelAccelerator. Tutti i diritti riservati.
        </div>
      </footer>
    </div>
  )
}
