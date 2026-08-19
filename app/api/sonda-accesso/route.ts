import { createServerClient } from "@supabase/ssr"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

// SONDA TEMPORANEA — da cancellare al termine della verifica a schermo.
// Serve solo perche' il sandbox del browser e' isolato e non puo' ricevere un
// cookie di sessione di 1900 caratteri per altra via.
// Chiusa in produzione e protetta da segreto: fallisce chiuso.
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 })
  }
  const chiave = new URL(request.url).searchParams.get("k")
  const atteso = process.env.CRON_SECRET
  if (!atteso || !chiave || chiave !== atteso) {
    return new NextResponse("Not found", { status: 404 })
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const email = process.env.MANUBOT_DEFAULT_EMAIL
  if (!url || !anon || !service || !email) {
    return NextResponse.json({ errore: "variabili mancanti" }, { status: 500 })
  }

  const admin = createAdminClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } })
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email })
  if (link.error) {
    return NextResponse.json({ errore: link.error.message }, { status: 500 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
      },
    },
  })
  // Con token_hash NON va passata l'email: il gettone la contiene gia'.
  const v = await supabase.auth.verifyOtp({ type: "email", token_hash: link.data.properties.hashed_token })
  if (v.error) {
    return NextResponse.json({ errore: v.error.message }, { status: 500 })
  }
  return NextResponse.json({ esito: "sessione creata", utente: v.data.user?.email })
}
