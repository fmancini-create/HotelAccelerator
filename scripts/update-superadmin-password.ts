// Script per aggiornare la password del super admin
// Esegui questo script dalla console v0

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function updatePassword() {
  const userId = "38542716-2111-4791-a424-6220c34c321c" // f.mancini@4bid.it
  const newPassword = "Pippolo75@"

  console.log("[v0] Updating password for super admin f.mancini@4bid.it...")

  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    password: newPassword,
  })

  if (error) {
    console.error("[v0] Error updating password:", error.message)
    process.exit(1)
  }

  console.log("[v0] Password updated successfully for:", data.user?.email)
}

updatePassword()
