import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCallerIdentity, adminUserIdPerDatabase } from "@/lib/auth/admin-access"
import {
  MINUTI_DISCONNESSIONE_PIATTAFORMA,
  risolviTempoDisconnessione,
  secondiPreavviso,
} from "@/lib/auth/auto-logout"

/**
 * Il tempo di disconnessione automatica di CHI CHIAMA.
 *
 * PERCHE' UNA ROTTA A PARTE E NON QUELLA DEI PERMESSI
 * Le rotte `/api/admin/users/[userId]/permissions` richiedono `requireTenantAdmin`.
 * La disconnessione riguarda ogni operatore, non solo gli amministratori: se il
 * conto alla rovescia leggesse da quelle rotte, un normale operatore
 * riceverebbe 403 e non verrebbe MAI disconnesso — cioe' la protezione
 * mancherebbe esattamente su chi lascia il computer al ricevimento.
 *
 * Qui bastano credenziali valide, e si puo' leggere SOLO il proprio tempo:
 * l'utente non e' un parametro, viene dalla sessione.
 */
export async function GET(request: NextRequest) {
  try {
    const identity = await getCallerIdentity(request)
    if (!identity) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    // Un super amministratore di piattaforma non ha scheda operatore
    // (`adminUserId` nullo) e non appartiene ai gruppi di una struttura.
    //
    // ATTENZIONE — QUI PRIMA SI RESTITUIVA `minuti: null`, cioe' "non si
    // disconnette mai". Il commento diceva "non ha un tempo da rispettare", ma
    // la conseguenza era che il ruolo con PIU' poteri sulla piattaforma era
    // l'unico mai disconnesso per inattivita', mentre un normale operatore si'.
    // Non e' che nessuno aveva deciso: e' che nessuno POTEVA decidere, perche'
    // per il super admin non esiste ne' scheda ne' gruppo su cui impostarlo.
    // Si applica quindi il tempo di piattaforma.
    if (identity.role === "super_admin") {
      return NextResponse.json({
        minuti: MINUTI_DISCONNESSIONE_PIATTAFORMA,
        origine: "piattaforma",
        secondiPreavviso: secondiPreavviso(MINUTI_DISCONNESSIONE_PIATTAFORMA),
      })
    }

    // `adminUserIdPerDatabase` serve perche' la scorciatoia di sviluppo
    // restituisce "dev-admin-id", che non e' un uuid e farebbe rifiutare
    // l'intera query dal database. Si controlla DOPO il super admin: la
    // scorciatoia ha `role: "admin"`, quindi non passa dal ramo qui sopra e lo
    // sviluppo resta senza disconnessione automatica come prima.
    const adminUserId = adminUserIdPerDatabase(identity.adminUserId)
    if (!adminUserId) {
      return NextResponse.json({ minuti: null, origine: "predefinito", secondiPreavviso: null })
    }

    const supabase = createServiceClient()

    const { data: utente } = await supabase
      .from("admin_users")
      .select("auto_logout_minutes")
      .eq("id", adminUserId)
      .maybeSingle()

    const { data: appartenenze } = await supabase
      .from("user_group_members")
      .select("user_groups!inner(name, auto_logout_minutes)")
      .eq("user_id", adminUserId)

    const gruppi = (appartenenze ?? [])
      .map((a: any) => a.user_groups)
      .filter((g: any) => g && typeof g.auto_logout_minutes === "number")
      .map((g: any) => ({ nome: g.name as string, minuti: g.auto_logout_minutes as number }))

    const risolto = risolviTempoDisconnessione({
      valoreUtente: utente?.auto_logout_minutes,
      gruppi,
    })

    return NextResponse.json({
      minuti: risolto.minuti,
      origine: risolto.origine,
      nomeGruppo: risolto.nomeGruppo ?? null,
      // Calcolato qui e non nel browser: cosi' il preavviso resta un'unica
      // regola anche se domani cambia.
      secondiPreavviso: risolto.minuti === null ? null : secondiPreavviso(risolto.minuti),
    })
  } catch (error: any) {
    // Un errore qui non deve bloccare l'uso della piattaforma: senza tempo
    // conosciuto non si disconnette nessuno (si perde la protezione, non
    // l'accesso al lavoro). Il contrario — buttare fuori la persona perche' una
    // query e' andata male — sarebbe molto peggio.
    console.error("[v0] auto-logout: lettura del tempo fallita:", error?.message)
    return NextResponse.json({ minuti: null, origine: "predefinito", secondiPreavviso: null })
  }
}
