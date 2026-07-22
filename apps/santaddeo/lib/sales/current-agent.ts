import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

/**
 * Risolve nome (e cognome) ed email del venditore attualmente loggato, da usare
 * per la FIRMA delle email ai lead. La firma deve sempre essere il nome reale
 * del venditore, mai "Staff/Team SANTADDEO".
 *
 * Priorità nome: sales_agents.display_name -> profiles.first_name+last_name.
 * Priorità email: sales_agents.email -> profiles.email -> auth email.
 * Ritorna stringhe vuote se nulla è risolvibile (il server applicherà comunque
 * i propri fallback all'invio).
 */
export async function resolveCurrentAgentIdentity(): Promise<{
  agentName: string
  agentEmail: string
}> {
  const { user, supabase } = await getAuthUserOrDev()
  if (!user) return { agentName: "", agentEmail: "" }

  const [{ data: profile }, { data: agent }] = await Promise.all([
    supabase.from("profiles").select("first_name, last_name, email").eq("id", user.id).maybeSingle(),
    supabase.from("sales_agents").select("display_name, email").eq("user_id", user.id).maybeSingle(),
  ])

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim()
  const agentName = (agent?.display_name?.trim() || fullName || "").trim()
  const agentEmail = (agent?.email || profile?.email || user.email || "").trim()

  return { agentName, agentEmail }
}
