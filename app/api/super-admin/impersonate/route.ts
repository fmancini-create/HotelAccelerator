import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * POST /api/super-admin/impersonate
 * Avvia impersonazione: setta un cookie httpOnly con il property_id del tenant
 * Solo super_admin attivi possono impersonare.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    // Verifica che sia super_admin attivo
    const { data: collaborator } = await supabase
      .from("platform_collaborators")
      .select("role, is_active")
      .eq("email", user.email)
      .maybeSingle()

    if (!collaborator || collaborator.role !== "super_admin" || !collaborator.is_active) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 })
    }

    const { property_id } = await request.json()

    if (!property_id) {
      return NextResponse.json({ error: "property_id obbligatorio" }, { status: 400 })
    }

    // Verifica che la property esista
    const { data: property, error: propError } = await supabase
      .from("properties")
      .select("id, name")
      .eq("id", property_id)
      .single()

    if (propError || !property) {
      return NextResponse.json({ error: "Struttura non trovata" }, { status: 404 })
    }

    // Setta il cookie di impersonazione
    const response = NextResponse.json({
      success: true,
      property: { id: property.id, name: property.name },
      message: `Impersonazione attivata per ${property.name}`,
    })

    response.cookies.set("x-impersonate-property-id", property.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 4, // 4 ore max
    })

    response.cookies.set("x-impersonate-property-name", property.name, {
      httpOnly: false, // Leggibile dal client per mostrare il banner
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 4,
    })

    return response
  } catch (error) {
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

/**
 * DELETE /api/super-admin/impersonate
 * Ferma impersonazione: rimuove i cookie
 */
export async function DELETE() {
  const response = NextResponse.json({ success: true, message: "Impersonazione terminata" })

  response.cookies.set("x-impersonate-property-id", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })

  response.cookies.set("x-impersonate-property-name", "", {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })

  return response
}
