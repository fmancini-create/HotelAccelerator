import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { Footer } from "@/components/layout/footer"
import { QuickLoginButtons } from "./quick-login-buttons"
import { LoginForm } from "./login-form"

export const metadata: Metadata = {
  title: "Accedi - Login al tuo Account",
  description: "Accedi al tuo account SANTADDEO per gestire il revenue della tua struttura ricettiva. Dashboard KPI, pricing dinamico e monitoraggio performance in tempo reale.",
  alternates: { canonical: "https://www.santaddeo.com/auth/login" },
  // 20/05/2026: noindex coerente con la decisione documentata in
  // app/sitemap.ts (audit 13/05): "/auth/login non e' una pagina SEO,
  // e' una pagina di conversione gated. Tenerla in sitemap dilata il
  // crawl budget senza valore informativo per Google". Il metadata
  // precedente ({index:true, follow:true}) contraddiceva la sitemap
  // (in cui /auth/login era stata rimossa) e robots.txt (che NON la
  // blocca esplicitamente). Ora robots: noindex, follow chiude il loop.
  robots: { index: false, follow: true },
  openGraph: {
    title: "Accedi | SANTADDEO Revenue Management",
    description: "Accedi alla dashboard SANTADDEO per monitorare e ottimizzare il revenue della tua struttura.",
    url: "https://www.santaddeo.com/auth/login",
  },
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string
    message?: string
    verified?: string
    redirectTo?: string
    /** Set a true ("1") quando l'utente arriva da un'email di benvenuto.
     *  Mostra un banner verde di conferma. Valori riconosciuti:
     *  - "sales_agent" → benvenuto venditore */
    welcome?: string
    /** Set a "1" dopo un reset password riuscito (vedi /auth/reset-password). */
    passwordReset?: string
    /** Marker che l'invito agent (sales_agent_invitations) e' stato accettato */
    agent_invite_accepted?: string
  }>
}) {
  const params = await searchParams

  // DEV BYPASS: If we're in dev and there's a redirectTo, skip login entirely
  // The dashboard will use the demo user automatically
  const headersList = await headers()
  const host = (headersList.get("host") || "").toLowerCase()
  const isProd = host.includes("vercel.app")
  const isDev = (
    host.includes("vusercontent.net") ||
    host.includes("localhost") ||
    process.env.NODE_ENV === "development"
  ) && !isProd

  if (isDev && params.redirectTo) {
    console.warn("[DEV BYPASS] login page auto-redirect to:", params.redirectTo)
    redirect(params.redirectTo)
  }

  const error = params.error
  const errorMessage = params.message
  const verified = params.verified === "1"
  const passwordReset = params.passwordReset === "1"
  const welcomeKind = params.welcome // "sales_agent" oggi, ev. estensibile
  const agentInviteAccepted = params.agent_invite_accepted === "1"

  // Durante un degrado del gateway Supabase, i flussi OAuth (google/route.ts,
  // callback/route.ts) mettono nella URL error.message grezzo, che puo' essere
  // il blob di un JSON.parse fallito su una pagina HTML di errore
  // ("Unexpected token '<', "<!DOCTYPE "... is not valid JSON") o un 5xx del
  // gateway. Non deve MAI arrivare cosi' all'utente: lo riconosciamo e mostriamo
  // un messaggio amichevole. E' il choke point unico dove ogni ?error= viene reso.
  const isTransientAuthBlob = (text: string) => {
    const t = text.toLowerCase()
    return (
      t.includes("unexpected token") ||
      t.includes("not valid json") ||
      t.includes("<!doctype") ||
      t.includes("<html") ||
      t.includes("failed to fetch") ||
      t.includes("fetch failed") ||
      t.includes("econnreset") ||
      t.includes("etimedout") ||
      t.includes("network") ||
      t.includes("timeout") ||
      t.includes("timed out") ||
      /\b(502|503|504)\b/.test(t)
    )
  }

  const TRANSIENT_MSG =
    "Servizio di autenticazione temporaneamente non disponibile. Riprova tra qualche istante."

  // Map error codes to user-friendly Italian messages
  const getErrorText = (code: string, message?: string) => {
    if (message) {
      const decoded = decodeURIComponent(message)
      return isTransientAuthBlob(decoded) ? TRANSIENT_MSG : decoded
    }
    switch (code) {
      case "not_registered":
        return "Utente non registrato. Contatta l'amministratore per richiedere l'accesso."
      case "oauth_error":
        return "Errore durante l'autenticazione con Google. Riprova."
      default:
        return isTransientAuthBlob(code) ? TRANSIENT_MSG : code
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <Link href="/" className="inline-block">
              <Image
                src="/logo-santaddeo.png"
                alt="SANTADDEO"
                width={200}
                height={80}
                className="mx-auto h-16 w-auto"
                priority
              />
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">
              Revenue Management System
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-700 font-medium">{getErrorText(error, errorMessage)}</p>
            </div>
          )}

          {/* Success / info banners (verde) */}
          {verified && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-700">Email verificata! Accedi con le tue credenziali.</p>
            </div>
          )}
          {passwordReset && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-700">
                Password aggiornata. Accedi con la nuova password.
              </p>
            </div>
          )}
          {agentInviteAccepted && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-700">
                Account venditore creato! Accedi con la tua nuova password per entrare nella tua area.
              </p>
            </div>
          )}
          {welcomeKind === "sales_agent" && !verified && !passwordReset && !agentInviteAccepted && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-700">
                Benvenuto nel team venditori SANTADDEO. Accedi con le tue credenziali per
                entrare nella tua area.
              </p>
            </div>
          )}

          {/* Login Form with show/hide password toggle */}
          <LoginForm />

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Oppure</span>
            </div>
          </div>

          {/* Google Sign-In */}
          <form method="POST" action="/api/auth/google">
            <button
              type="submit"
              className="w-full py-2 px-4 border border-input bg-background hover:bg-accent text-foreground font-medium rounded-md transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Accedi con Google
            </button>
          </form>

          {/* Links */}
          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>
              Non hai un account?{" "}
              <Link href="/auth/sign-up" className="text-primary hover:underline font-medium">
                Registrati
              </Link>
            </p>
          </div>

          {/* Quick Login Buttons (Client Component - only renders in dev) */}
          <QuickLoginButtons />
        </div>
      </main>

      <Footer />
    </div>
  )
}
