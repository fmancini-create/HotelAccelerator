import Link from "next/link"
import { ArrowLeft, ShieldCheck, CheckCircle2, Clock } from "lucide-react"
import type { Metadata } from "next"
import { Button } from "@/components/ui/button"
import { HotelAcceleratorMark } from "@/components/brand/hotel-accelerator-logo"

export const metadata: Metadata = {
  title: { absolute: "Sicurezza e Protezione Dati | HotelAccelerator" },
  description:
    "Consulta architettura, controlli di accesso, separazione dei tenant, gestione dei segreti e stato del programma di sicurezza e conformità HotelAccelerator.",
  alternates: { canonical: "https://www.hotelaccelerator.com/trust" },
  keywords: "sicurezza hotel accelerator, protezione dati piattaforma hotel, trust center",
  openGraph: {
    title: "Sicurezza e Protezione Dati | HotelAccelerator",
    description:
      "Consulta architettura, controlli di accesso, separazione dei tenant, gestione dei segreti e stato del programma di sicurezza e conformità HotelAccelerator.",
    type: "website",
    url: "https://www.hotelaccelerator.com/trust",
  },
}

const controls = [
  {
    title: "Separazione dei tenant",
    description:
      "Controlli applicativi e policy RLS limitano query e accessi alle organizzazioni e strutture autorizzate. Ogni hotel opera in un perimetro isolato: nessun dato è accessibile da tenant diversi.",
  },
  {
    title: "Autenticazione e ruoli",
    description:
      "Le aree applicative verificano sessione, ruolo e perimetro prima di rendere disponibili funzioni e dati. Sono previsti ruoli distinti per super-admin, admin di struttura e collaboratori.",
  },
  {
    title: "Webhook e integrazioni esterne",
    description:
      "Ogni webhook in entrata (WhatsApp, Stripe, Telegram, Gmail, Meta) viene verificato tramite firma crittografica prima di essere elaborato. Token e segreti non transitano nei parametri URL.",
  },
  {
    title: "Segreti e chiavi",
    description:
      "Credenziali e chiavi operative sono mantenute fuori dal codice pubblico tramite variabili d'ambiente cifrate. Le credenziali OAuth e i token di messaggistica sono cifrati a riposo nel database.",
  },
  {
    title: "Database e migrazioni",
    description:
      "Le modifiche strutturali vengono versionate tramite migration tracciate. Accessi e policy RLS sono revisionati separatamente dall'interfaccia applicativa con audit empirici periodici.",
  },
  {
    title: "Infrastruttura",
    description:
      "Applicazione e servizi dati dipendono da fornitori infrastrutturali distinti (Vercel, Supabase) con configurazioni e responsabilità separate. Il deploy avviene tramite pipeline CI/CD controllata.",
  },
  {
    title: "Incidenti e vulnerabilità",
    description:
      "Procedure, controlli e test di ripristino fanno parte del programma di sicurezza e vengono dichiarati conclusi solo con evidenze documentate.",
  },
]

const programItems = [
  {
    status: "active" as const,
    title: "Controlli server-side e RLS",
    description:
      "Autorizzazione applicativa e policy dati vengono usate come livelli separati di difesa. Audit empirici periodici verificano l'accesso reale del ruolo anonimo su tutte le tabelle esposte.",
  },
  {
    status: "active" as const,
    title: "Versionamento e revisione",
    description:
      "Codice e migrazioni sono gestiti tramite repository con revisione delle modifiche prima del deploy in produzione.",
  },
  {
    status: "active" as const,
    title: "Verifica firma webhook",
    description:
      "Tutti i webhook in entrata da piattaforme esterne vengono autenticati tramite HMAC o token secret prima dell'elaborazione.",
  },
  {
    status: "in-progress" as const,
    title: "Programma Hotel Accelerator Security Hardening",
    description:
      "Include hardening API, revisione RLS estesa, MFA amministrativa, vulnerability management, incident response e test di ripristino.",
  },
  {
    status: "in-progress" as const,
    title: "Restrizioni API key esterne",
    description:
      "Le chiavi API per servizi di terze parti (es. Google Places) sono in fase di configurazione con restrizioni per dominio e referrer HTTP.",
  },
]

const faqs = [
  {
    q: "Le certificazioni dei fornitori valgono anche per 4 BID?",
    a: "No. Una certificazione del provider infrastrutturale non equivale automaticamente a una certificazione di 4 BID S.r.l. o di HotelAccelerator.",
  },
  {
    q: "Come vengono gestiti gli accessi tra strutture diverse?",
    a: "Ogni struttura opera in un perimetro isolato a livello di database tramite Row Level Security. Un utente autenticato per una struttura non può accedere ai dati di un'altra.",
  },
  {
    q: "Dove trovo le informazioni sul trattamento dei dati personali?",
    a: "L'informativa privacy descrive titolare, finalità, basi giuridiche, conservazione e diritti degli interessati.",
  },
]

export default function TrustPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <HotelAcceleratorMark className="h-8 w-8" priority />
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

          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-400 uppercase tracking-widest">Trust Center</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            Sicurezza, accessi e protezione dei dati in HotelAccelerator
          </h1>
          <p className="text-gray-400 mb-3 leading-relaxed">
            Questa pagina descrive i controlli pubblicamente dichiarati e separa le misure attive dai lavori ancora
            in corso. Non attribuisce a 4 BID certificazioni possedute da fornitori terzi.
          </p>
          <p className="text-sm text-gray-500 mb-16">
            Stato della pagina: 6 settembre 2026
          </p>

          {/* Controlli dichiarati */}
          <section className="mb-16">
            <h2 className="text-xl font-semibold text-white mb-8">Controlli dichiarati</h2>
            <div className="space-y-6">
              {controls.map((control) => (
                <div
                  key={control.title}
                  className="border border-white/10 rounded-xl p-6 bg-white/[0.02]"
                >
                  <h3 className="font-semibold text-white mb-2">{control.title}</h3>
                  <p className="text-gray-400 leading-relaxed text-sm">{control.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Stato del programma */}
          <section className="mb-16">
            <h2 className="text-xl font-semibold text-white mb-8">Stato del programma</h2>
            <div className="space-y-4">
              {programItems.map((item) => (
                <div
                  key={item.title}
                  className="flex gap-4 border border-white/10 rounded-xl p-6 bg-white/[0.02]"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {item.status === "active" ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <Clock className="h-5 w-5 text-amber-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          item.status === "active"
                            ? "bg-emerald-400/10 text-emerald-400"
                            : "bg-amber-400/10 text-amber-400"
                        }`}
                      >
                        {item.status === "active" ? "Attivo" : "In corso"}
                      </span>
                    </div>
                    <h3 className="font-semibold text-white mb-1">{item.title}</h3>
                    <p className="text-gray-400 leading-relaxed text-sm">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Come leggere questa pagina */}
          <section className="mb-16 border border-white/10 rounded-xl p-6 bg-white/[0.02]">
            <h2 className="text-xl font-semibold text-white mb-4">Come leggere questa pagina</h2>
            <ul className="space-y-2 text-gray-400 text-sm leading-relaxed">
              <li>• una misura pianificata non viene presentata come già completata;</li>
              <li>• le attestazioni dei fornitori non vengono trasferite al prodotto;</li>
              <li>• configurazione tecnica e obblighi privacy sono documenti distinti;</li>
              <li>
                • per il trattamento dei dati personali fa fede l&apos;
                <Link href="/privacy" className="text-white underline underline-offset-2 hover:text-gray-300">
                  informativa privacy
                </Link>
                .
              </li>
            </ul>
          </section>

          {/* FAQ */}
          <section className="mb-16">
            <h2 className="text-xl font-semibold text-white mb-8">Domande frequenti</h2>
            <div className="space-y-4">
              {faqs.map((faq) => (
                <div key={faq.q} className="border border-white/10 rounded-xl p-6 bg-white/[0.02]">
                  <h3 className="font-semibold text-white mb-2">{faq.q}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Suite 4BID */}
          <section className="border border-white/10 rounded-xl p-8 bg-white/[0.02]">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Hotel Accelerator Suite</p>
            <h2 className="text-xl font-semibold text-white mb-6">Una gestione alberghiera davvero completa</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Link
                href="https://www.santaddeo.com"
                className="block border border-white/10 rounded-lg p-5 hover:border-white/20 hover:bg-white/5 transition"
              >
                <p className="text-xs text-gray-500 mb-1">Revenue Management</p>
                <p className="font-semibold text-white mb-1">SANTADDEO</p>
                <p className="text-gray-400 text-sm">
                  Ottimizza prezzi e ricavi con il Revenue Management System per hotel.
                </p>
              </Link>
              <Link
                href="https://www.hotelprofitai.com"
                className="block border border-white/10 rounded-lg p-5 hover:border-white/20 hover:bg-white/5 transition"
              >
                <p className="text-xs text-gray-500 mb-1">Controllo di gestione</p>
                <p className="font-semibold text-white mb-1">HotelProfitAI</p>
                <p className="text-gray-400 text-sm">
                  Controlla costi, marginalità, budget e performance economica in un&apos;unica dashboard.
                </p>
              </Link>
              <Link
                href="https://www.manubot.it"
                className="block border border-white/10 rounded-lg p-5 hover:border-white/20 hover:bg-white/5 transition md:col-span-2"
              >
                <p className="text-xs text-gray-500 mb-1">Manutenzioni intelligenti</p>
                <p className="font-semibold text-white mb-1">MANUBOT</p>
                <p className="text-gray-400 text-sm">
                  Gestisce manutenzioni, operatori, fornitori, housekeeping e scadenze con strumenti pensati per hotel e strutture ricettive.
                </p>
              </Link>
            </div>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-4">
        <div className="container mx-auto max-w-3xl flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <p>© 2026 4 BID S.r.l. — Via Sorripa, 10 – 50026 San Casciano in Val di Pesa (FI) — P. IVA 06241710489</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition">Termini</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
