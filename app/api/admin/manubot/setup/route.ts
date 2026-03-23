/**
 * API Route temporanea per setup integrazione Manubot
 * GET /api/admin/manubot/setup
 *
 * 1. Autentica su Manubot Supabase
 * 2. Recupera il company_id reale di Villa I Barronci
 * 3. Genera api_token per webhook receiver
 * 4. Salva tutto su HotelAccelerator Supabase
 *
 * Da chiamare UNA VOLTA dal browser in ambiente dev/preview.
 */

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import crypto from "crypto"

const MANUBOT_SUPABASE_URL = "https://qqcxeksvegvmgajmyqcz.supabase.co"
const MANUBOT_EMAIL        = "f.mancini@ibarronci.com"
const MANUBOT_PASSWORD     = "Pippolo75@manubot"
const MANUBOT_BASE_URL     = "https://manubot.it/api"

export async function GET(req: NextRequest) {
  // Solo in dev/preview
  const host = req.headers.get("host") || ""
  const isAllowed =
    host.includes("vusercontent.net") ||
    host.includes("vercel.run") ||
    host.includes("localhost") ||
    host.includes("127.0.0.1")

  if (!isAllowed) {
    return NextResponse.json({ error: "Solo in ambiente dev/preview" }, { status: 403 })
  }

  const log: string[] = []

  try {
    // ── Step 0: Recupera anon key ─────────────────────────────────────────
    // Può essere passata manualmente come ?anon_key=xxx nel query param
    const { searchParams } = new URL(req.url)
    const manualAnonKey = searchParams.get("anon_key") || ""

    // ── Step 0: Recupera anon key da Supabase (header x-supabase-anon-key) ──
    // L'endpoint pubblico /rest/v1/ restituisce l'anon key negli header CORS
    log.push("0. Recupero anon key Manubot Supabase...")
    let MANUBOT_ANON_KEY = ""
    try {
      const infoRes = await fetch(`${MANUBOT_SUPABASE_URL}/auth/v1/settings`, {
        method: "GET",
      })
      // Prova a leggere la chiave dall'header che alcuni Supabase espongono
      MANUBOT_ANON_KEY = infoRes.headers.get("x-supabase-anon-key") || ""
      log.push(`   anon key da header: ${MANUBOT_ANON_KEY ? "trovata" : "non trovata"}`)
    } catch { /* ignora */ }

    // Se non trovata, proviamo senza apikey (alcuni progetti lo permettono)
    // Il progetto Manubot potrebbe avere auth.password_signup = true e apikey opzionale
    log.push("   Tentativo login senza apikey header...")

    // ── Step 1: Login su Manubot ─────────────────────────────────────────
    log.push("1. Login su Manubot Supabase...")

    const finalAnonKey = manualAnonKey || MANUBOT_ANON_KEY
    const loginHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (finalAnonKey) {
      loginHeaders["apikey"] = finalAnonKey
      log.push(`   anon key disponibile: ${finalAnonKey.slice(0, 20)}...`)
    } else {
      log.push("   nessuna anon key disponibile, tentativo senza header apikey")
    }

    const loginRes = await fetch(
      `${MANUBOT_SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: loginHeaders,
        body: JSON.stringify({ email: MANUBOT_EMAIL, password: MANUBOT_PASSWORD }),
      }
    )

    if (!loginRes.ok) {
      const err = await loginRes.text()
      return NextResponse.json({
        error: `Login Manubot fallito: ${err}`,
        log,
        fix: "Serve l'anon key del progetto Supabase di Manubot. Chiedila al team Manubot oppure leggila da manubot.it nel sorgente della pagina (cerca 'SUPABASE_ANON_KEY' o 'apikey').",
      }, { status: 500 })
    }

    const authData = await loginRes.json()
    const accessToken = authData.access_token
    log.push(`   Login OK — token ottenuto (scade: ${new Date((authData.expires_at || Date.now() / 1000 + 3600) * 1000).toISOString()})`)

    // ── Step 2: Recupera company_id ───────────────────────────────────────
    log.push("2. Recupero company_id...")
    let companyId: string | null = null

    // Tenta dal profilo utente in Supabase di Manubot
    const profileRes = await fetch(
      `${MANUBOT_SUPABASE_URL}/rest/v1/profiles?select=active_company_id,company_id&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: accessToken,
          Accept: "application/json",
        },
      }
    )
    if (profileRes.ok) {
      const profiles = await profileRes.json()
      log.push(`   Profiles raw: ${JSON.stringify(profiles)}`)
      companyId = profiles?.[0]?.active_company_id || profiles?.[0]?.company_id || null
    }

    // Tenta da /user metadata
    if (!companyId) {
      const userRes = await fetch(`${MANUBOT_SUPABASE_URL}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (userRes.ok) {
        const user = await userRes.json()
        log.push(`   User metadata: ${JSON.stringify(user.user_metadata)}`)
        log.push(`   App metadata: ${JSON.stringify(user.app_metadata)}`)
        companyId =
          user.user_metadata?.company_id ||
          user.user_metadata?.active_company_id ||
          user.app_metadata?.company_id ||
          null
      }
    }

    // Tenta da API Manubot /companies
    if (!companyId) {
      const companiesRes = await fetch(`${MANUBOT_BASE_URL}/companies`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      log.push(`   /companies status: ${companiesRes.status}`)
      if (companiesRes.ok) {
        const data = await companiesRes.json()
        log.push(`   /companies raw: ${JSON.stringify(data).slice(0, 300)}`)
        const list = Array.isArray(data) ? data : data.companies || data.data || []
        const match = list.find((c: any) =>
          c.name?.toLowerCase().includes("barronci") ||
          c.name?.toLowerCase().includes("villa")
        ) || list[0]
        companyId = match?.id || null
        if (companyId) log.push(`   company trovato: ${match?.name} (${companyId})`)
      }
    }

    if (!companyId) {
      return NextResponse.json({
        error: "company_id non trovato automaticamente. Vedi 'log' per debug.",
        log,
        suggestion: "Controlla manualmente il profilo su Manubot e incolla il company_id",
      }, { status: 422 })
    }
    log.push(`   company_id: ${companyId}`)

    // ── Step 3: Genera api_token per webhook receiver ─────────────────────
    const apiToken = crypto.randomBytes(32).toString("hex")
    log.push(`3. api_token generato: ${apiToken}`)

    // ── Step 4: Salva su HotelAccelerator Supabase ────────────────────────
    log.push("4. Salvataggio su HotelAccelerator Supabase...")
    const supabase = await createClient()

    // Trova la property (prova per slug, poi per ID dev)
    const { data: properties } = await supabase
      .from("properties")
      .select("id, name, slug")
      .or("slug.eq.villa-i-barronci,id.eq.dev-property-id")
      .limit(1)

    log.push(`   Properties trovate: ${JSON.stringify(properties)}`)
    const property = properties?.[0]

    if (!property) {
      return NextResponse.json({
        error: "Property 'villa-i-barronci' non trovata su HotelAccelerator",
        log,
      }, { status: 404 })
    }

    const { error: updateErr } = await supabase
      .from("properties")
      .update({
        manubot_email:        MANUBOT_EMAIL,
        manubot_password:     MANUBOT_PASSWORD,
        manubot_supabase_url: MANUBOT_SUPABASE_URL,
        manubot_company_id:   companyId,
        api_token:            apiToken,
      })
      .eq("id", property.id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message, log }, { status: 500 })
    }

    log.push(`   Salvato su property: ${property.name || property.id}`)

    return NextResponse.json({
      success: true,
      property_id: property.id,
      property_name: property.name,
      manubot_company_id: companyId,
      api_token: apiToken,
      webhook_endpoint: `${process.env.NEXT_PUBLIC_APP_URL}/api/external/manubot`,
      instructions: [
        "Vai su Manubot → Dashboard → Impostazioni → Integrazioni",
        `Inserisci l'endpoint: ${process.env.NEXT_PUBLIC_APP_URL}/api/external/manubot`,
        `Inserisci il Bearer Token: ${apiToken}`,
        "Seleziona gli eventi: task.created, task.updated, task.completed",
      ],
      log,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message, log }, { status: 500 })
  }
}
