import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, name } = body

    // Validazione: solo questo email può fare il setup
    if (email !== "f.mancini@ibarronci.com") {
      return NextResponse.json({ error: "Email non autorizzata" }, { status: 403 })
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Verifica se ci sono già admin
    const { data: existingAdmins, error: checkError } = await supabase.from("admin_users").select("id").limit(1)

    if (checkError) {
      console.error("[v0] Error checking existing admins:", checkError)
      return NextResponse.json({ error: "Errore durante la verifica degli admin esistenti" }, { status: 500 })
    }

    if (existingAdmins && existingAdmins.length > 0) {
      return NextResponse.json({ error: "Setup già completato. Esiste già un admin." }, { status: 400 })
    }

    // Crea l'utente in Supabase Auth
    const { data: authData, error: signUpError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-conferma l'email
    })

    if (signUpError || !authData.user) {
      console.error("[v0] Error creating auth user:", signUpError)
      return NextResponse.json(
        { error: signUpError?.message || "Errore durante la creazione dell'utente" },
        { status: 500 },
      )
    }

    const { error: insertError } = await supabase.from("admin_users").insert({
      id: authData.user.id,
      email,
      name,
      role: "super_admin",
      can_upload: true,
      can_delete: true,
      can_move: true,
      can_manage_users: true,
      can_manage_categories: true,
    })

    if (insertError) {
      console.error("[v0] Error inserting admin user:", insertError)

      // Cleanup: rimuovi l'utente da auth se l'insert fallisce
      await supabase.auth.admin.deleteUser(authData.user.id)

      return NextResponse.json({ error: "Errore durante la creazione del profilo admin" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "Super Admin creato con successo!",
    })
  } catch (error) {
    console.error("[v0] Setup error:", error)
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 })
  }
}
