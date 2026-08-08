"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { getPublicSupabaseConfig } from "@/lib/supabase/config"
export async function loginAction(formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) {
    return { error: "Email e password sono obbligatori" }
  }

  let redirectPath = "/dashboard"

  try {
    const { url: supabaseUrl, publishableKey: supabaseKey } = getPublicSupabaseConfig()
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.santaddeo.com"

    const https = await import("https")

    const url = new URL(`${supabaseUrl}/auth/v1/token?grant_type=password`)
    const postData = JSON.stringify({ email, password })

    const result = await new Promise<any>((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }

      const req = https.default.request(options, (res) => {
        let data = ""

        res.on("data", (chunk) => {
          data += chunk
        })

        res.on("end", () => {
          try {
            const parsed = JSON.parse(data)
            resolve({ status: res.statusCode, data: parsed })
          } catch {
            reject(new Error("Invalid JSON response from Supabase"))
          }
        })
      })

      req.on("error", reject)
      req.write(postData)
      req.end()
    })

    if (result.status !== 200) {
      const msg =
        result.data?.error_description ||
        result.data?.message ||
        "Credenziali non valide"

      if (result.data?.error === "email_not_confirmed") {
        return {
          error:
            "Devi verificare la tua email prima di accedere. Controlla la posta.",
        }
      }

      return { error: msg }
    }

    const { access_token, refresh_token, user } = result.data

    if (!access_token || !user) {
      return { error: "Risposta non valida dal server" }
    }

    const cookieStore = await cookies()

    cookieStore.set("sb-access-token", access_token, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    })

    if (refresh_token) {
      cookieStore.set("sb-refresh-token", refresh_token, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
      })
    }

    cookieStore.set("sb-user-id", user.id, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    })

    // 🔐 ROLE CHECK - usa il resolver condiviso (legge profiles.role +
    // user_property_map + organization_id) cosi' i venditori dual-role
    // (con accesso struttura) vengono mandati al selettore /auth/choose-profile
    // invece che dritti a /sales.
    try {
      const { createServiceRoleClient } = await import("@/lib/supabase/server")
      const { resolveLanding } = await import("@/lib/auth/resolve-landing")
      const supabaseAdmin = await createServiceRoleClient()

      const landing = await resolveLanding(supabaseAdmin, user.id)
      redirectPath = landing.path
      console.log("[v0] Login resolved landing:", redirectPath)
    } catch (e) {
      console.error("[v0] Role check error:", e)
      // fallback silenzioso → dashboard
    }
    
    console.log("[v0] Final redirect path:", redirectPath)
  } catch {
    return { error: "Errore durante il login. Riprova." }
  }

  redirect(redirectPath)
}
