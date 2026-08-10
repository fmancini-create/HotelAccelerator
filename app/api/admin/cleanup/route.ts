import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { assertBootstrapWindow } from "@/lib/auth/bootstrap-guard"
import { accessErrorStatus, isAccessError } from "@/lib/auth/admin-access"

/**
 * Rimuove un account rimasto a meta' durante la PRIMA installazione.
 *
 * Era chiamabile da chiunque, senza credenziali: bastava inviare un indirizzo
 * email per cancellare quell'account. Misurato dal dominio pubblico con un
 * utente usa-e-getta: HTTP 200 e utente effettivamente cancellato.
 *
 * Ora e' consentita solo finche' non esiste alcun amministratore, cioe' la
 * sola finestra in cui serve davvero.
 */
export async function POST(request: Request) {
  try {
    await assertBootstrapWindow()

    const { email } = await request.json()

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Delete from auth.users
    const { data: users } = await supabaseAdmin.auth.admin.listUsers()
    const userToDelete = users.users.find((u) => u.email === email)

    if (userToDelete) {
      await supabaseAdmin.auth.admin.deleteUser(userToDelete.id)
    }

    // Delete from admin_users
    await supabaseAdmin.from("admin_users").delete().eq("email", email)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    // Un diniego non e' un errore del server: deve tornare 403, non 500.
    if (isAccessError(error) || error?.name === "AccessError") {
      return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
    }
    console.error("[v0] Cleanup error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
