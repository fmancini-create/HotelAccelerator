import { createClient } from "@supabase/supabase-js"
import { AccessError } from "@/lib/auth/admin-access"

/**
 * Guardia per le rotte di PRIMA INSTALLAZIONE.
 *
 * Perche' esiste: `/api/admin/cleanup` cancellava un account partendo dalla
 * sola email, SENZA alcuna autenticazione. Misurato dal dominio pubblico:
 * un estraneo senza credenziali ha cancellato un utente reale (HTTP 200).
 *
 * Non basta chiedere privilegi di amministratore, perche' durante la prima
 * installazione NON esiste ancora nessun amministratore che possa
 * autenticarsi: la rotta serve proprio a preparare il primo accesso.
 *
 * La finestra legittima e' quindi una sola: il sistema non e' ancora
 * inizializzato. Appena esiste il primo amministratore la rotta si chiude
 * per sempre. E' una condizione che non puo' essere riaperta da fuori.
 */
export async function assertBootstrapWindow(): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { count, error } = await supabase.from("admin_users").select("id", { count: "exact", head: true })

  // In caso di dubbio si CHIUDE. Un errore di lettura non deve diventare
  // una porta aperta: e' lo stesso schema del 500 che ricade su anonimo.
  if (error) {
    throw new AccessError("Impossibile verificare lo stato di installazione", 503)
  }

  if ((count ?? 0) > 0) {
    throw new AccessError("Installazione gia' completata: rotta non disponibile", 403)
  }
}
