/**
 * /auth/confirm — server-side verifica del token magic-link.
 *
 * Pattern Supabase SSR raccomandato per Next.js Route Handlers:
 *
 *   1. Crei una NextResponse PRIMA della verifyOtp.
 *   2. Costruisci un Supabase client che LEGGE da request.cookies e
 *      SCRIVE su response.cookies — non passi piu' per cookies() di
 *      next/headers, perche' in Route Handler con NextResponse.redirect
 *      i cookie settati via next/headers NON vengono propagati nella
 *      response esplicita (problema noto di Next.js 15/16, cita la doc
 *      Supabase https://supabase.com/docs/guides/auth/server-side/nextjs).
 *   3. verifyOtp: se ok, i cookie di sessione vengono scritti su
 *      response.cookies; se errore, ritorni una redirect verso login.
 *
 * Email contiene link tipo:
 *   https://www.santaddeo.com/auth/confirm
 *     ?token_hash=<hashed_token>
 *     &type=recovery
 *     &next=%2Fauth%2Freset-password%3Fsetup%3D1%26next%3D%2Fsales
 *
 * Robusto contro link-preview di Outlook/Gmail: se il token e' gia'
 * stato consumato dallo scanner, verifyOtp ritorna error e mostriamo
 * messaggio chiaro all'utente. Il superadmin puo' rispedire il link.
 */

import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { getPublicSupabaseConfig } from "@/lib/supabase/server"

// Tipi OTP che accettiamo. Gli altri (es. "invite") li trattiamo come
// errore per evitare attacchi di confusion.
// "magiclink" e' stato aggiunto il 12/05/2026 per supportare i magic link
// generati da force-onboarding superadmin (caso "Nunia in Rome": l'utente
// esiste gia' ed e' verificato, vogliamo solo un login link verso /onboarding).
const ALLOWED_TYPES = ["recovery", "signup", "email", "email_change", "magiclink"] as const
type AllowedType = (typeof ALLOWED_TYPES)[number]

function isAllowedType(t: string | null): t is AllowedType {
  return !!t && (ALLOWED_TYPES as readonly string[]).includes(t)
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type")
  const rawNext = searchParams.get("next") || "/dashboard"

  // Sanity: solo path interni (no http://...) per evitare open redirect.
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/dashboard"

  console.log("[auth/confirm] incoming", { hasToken: !!tokenHash, type, next })

  if (!tokenHash || !isAllowedType(type)) {
    console.error("[auth/confirm] missing or invalid params", {
      tokenHash: !!tokenHash,
      type,
    })
    return NextResponse.redirect(
      `${origin}/auth/login?error=invalid_link&message=${encodeURIComponent(
        "Link non valido. Richiedi un nuovo link.",
      )}`,
    )
  }

  // STEP 1: crea la response del successo PRIMA di verifyOtp, cosi'
  // possiamo passarla al client Supabase per la scrittura cookie.
  const successResponse = NextResponse.redirect(`${origin}${next}`)

  // STEP 2: client Supabase con cookies legati a request/response.
  // request.cookies → lettura | response.cookies → scrittura.
  const { url, anonKey } = getPublicSupabaseConfig()
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          // Scriviamo sui cookies della response che ritorneremo (success).
          successResponse.cookies.set({ name, value, ...options })
        })
      },
    },
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: true,
      // Deve matchare la cookie name usata da /api/auth/login (vedi server.ts)
      storageKey: "sb-aeynirkfixurikshxfov-auth-token",
    },
  })

  // STEP 3: valida il token. Se ok, i cookie sono gia' su successResponse.
  const { data, error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  })

  if (error) {
    console.error("[auth/confirm] verifyOtp error:", error.message, {
      status: (error as { status?: number }).status,
      name: error.name,
    })
    // Distinguiamo gli errori per UX migliore: scaduto vs gia' usato vs altro.
    const lower = (error.message || "").toLowerCase()
    let userMsg =
      "Link non valido o scaduto. Chiedi all'amministratore un nuovo link."
    if (lower.includes("expired")) {
      userMsg = "Il link e' scaduto. Chiedi all'amministratore un nuovo link."
    } else if (
      lower.includes("invalid") ||
      lower.includes("not found") ||
      lower.includes("token")
    ) {
      userMsg =
        "Link gia' utilizzato o non valido. Se hai gia' impostato la password, accedi con email e password."
    }
    return NextResponse.redirect(
      `${origin}/auth/login?error=link_invalid&message=${encodeURIComponent(
        userMsg,
      )}`,
    )
  }

  console.log("[auth/confirm] verifyOtp OK", {
    userId: data?.user?.id,
    email: data?.user?.email,
    cookieCount: successResponse.cookies.getAll().length,
  })

  return successResponse
}
