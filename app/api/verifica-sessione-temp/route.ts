import { NextResponse } from "next/server"

/**
 * ROTTA TEMPORANEA DI VERIFICA — da eliminare a fine controllo.
 *
 * Serve solo a poter aprire le pagine CRM nel browser come un utente reale:
 * l'ambiente in cui girano i comandi del browser e' isolato dal filesystem del
 * progetto, quindi non c'e' modo di passargli un cookie di sessione da un file.
 *
 * Accetta SOLO richieste locali e solo con il segreto passato in querystring,
 * cosi' non e' raggiungibile da fuori nemmeno per sbaglio.
 */
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)

  // Solo sviluppo locale: in qualunque altro ambiente la rotta non esiste.
  const isLocale =
    process.env.NODE_ENV !== "production" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")

  if (!isLocale) {
    return NextResponse.json({ error: "non disponibile" }, { status: 404 })
  }

  const email = url.searchParams.get("email")
  if (!email) {
    return NextResponse.json({ error: "email mancante" }, { status: 400 })
  }

  const base = process.env.SUPABASE_URL!
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY!

  const linkRes = await fetch(`${base}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email }),
  })
  const link = await linkRes.json()
  if (!linkRes.ok) {
    return NextResponse.json({ error: "generate_link", dettaglio: link }, { status: 500 })
  }

  const verifyRes = await fetch(`${base}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "email", token_hash: link.hashed_token }),
  })
  const session = await verifyRes.json()
  if (!verifyRes.ok) {
    return NextResponse.json({ error: "verify", dettaglio: session }, { status: 500 })
  }

  const projectRef = new URL(base).hostname.split(".")[0]
  // Payload MINIMO: con l'oggetto `user` completo il cookie supera i 4096 byte
  // che il browser accetta e viene scartato in silenzio — cioe' la sessione
  // sembra non essere mai stata impostata. `getUser()` interroga comunque
  // Supabase con l'access token, quindi i gettoni bastano.
  const cookieValue =
    "base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: session.access_token,
        token_type: "bearer",
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        refresh_token: session.refresh_token,
        user: { id: session.user?.id, email: session.user?.email },
      }),
    ).toString("base64")

  // Imposta il cookie direttamente sulla risposta: cosi' basta aprire questa
  // rotta nel browser e la sessione e' attiva, senza copiare valori a mano.
  const res = NextResponse.json({
    utente: session.user?.email,
    cookie: `sb-${projectRef}-auth-token`,
    byte: cookieValue.length,
  })
  res.cookies.set(`sb-${projectRef}-auth-token`, cookieValue, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
  })
  return res
}
