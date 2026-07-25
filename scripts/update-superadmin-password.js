/**
 * Aggiorna la password di un super admin via Supabase Auth Admin API.
 *
 * SICUREZZA: nessuna password e nessun identificativo reale in questo file.
 * La password precedentemente hardcoded qui e' stata rimossa
 * (vedi docs/SECURITY_SECRET_ROTATION_NOTES.md) e va considerata compromessa.
 *
 * Esecuzione (usare un .env locale NON tracciato, per non lasciare la
 * password nella history della shell):
 *
 *   node --env-file-if-exists=.env.local scripts/update-superadmin-password.js
 *
 * Env richieste:
 *   SUPABASE_URL o NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   TARGET_USER_ID      id dell'utente Supabase Auth da aggiornare
 *   NEW_PASSWORD        nuova password
 */

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const targetUserId = process.env.TARGET_USER_ID
const newPassword = process.env.NEW_PASSWORD

const missing = [
  ["SUPABASE_URL", supabaseUrl],
  ["SUPABASE_SERVICE_ROLE_KEY", supabaseServiceKey],
  ["TARGET_USER_ID", targetUserId],
  ["NEW_PASSWORD", newPassword],
]
  .filter(([, value]) => !value)
  .map(([name]) => name)

if (missing.length > 0) {
  console.error(`[v0] Env mancanti: ${missing.join(", ")}`)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function updatePassword() {
  console.log("[v0] Aggiornamento password in corso...")

  const { data, error } = await supabase.auth.admin.updateUserById(targetUserId, {
    password: newPassword,
  })

  if (error) {
    console.error("[v0] Errore aggiornamento password:", error.message)
    process.exit(1)
  }

  // Nessun dato sensibile nei log: solo conferma.
  console.log(`[v0] Password aggiornata per l'utente ${data.user.id}`)
}

updatePassword()
