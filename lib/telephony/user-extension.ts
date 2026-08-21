import type { NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getCallerIdentity } from "@/lib/auth/admin-access"

/**
 * Interno telefonico della singola persona.
 *
 * Un solo posto per leggere e risolvere gli interni: la chiamata in uscita, il
 * riconoscimento in arrivo e la pagina di gestione devono usare la STESSA
 * regola, altrimenti si riparte con "funziona da una parte e non dall'altra".
 */

export type ResolvedIdentity = {
  propertyId: string
  userId: string
  fullName: string
}

/**
 * Traduce l'identità unificata della piattaforma nella forma usata dal modulo
 * telefonico e dal PMS.
 *
 * Un superadmin non deve avere una riga `admin_users` duplicata in ogni
 * struttura: il tenant corrente arriva dal selettore piattaforma ed è già
 * validato da `getCallerIdentity`. In quel caso `userId` resta vuoto perché
 * non esiste una scheda operatore tenant da usare come FK; le letture continuano
 * a funzionare e il click-to-call usa l'interno predefinito della struttura.
 */
export async function resolveIdentity(request?: NextRequest): Promise<ResolvedIdentity> {
  const identity = await getCallerIdentity(request)

  if (!identity) {
    throw new Error("Non autenticato")
  }
  if (!identity.propertyId) {
    throw new Error("Struttura non determinata")
  }

  return {
    propertyId: identity.propertyId,
    userId: identity.adminUserId ?? "",
    fullName: identity.fullName ?? identity.email ?? "Utente",
  }
}

export type MyExtension =
  | { ok: true; extension: string; canCall: boolean; identity: ResolvedIdentity }
  | { ok: false; reason: "none" | "cannot_call"; identity: ResolvedIdentity }

/**
 * Interno della persona che sta usando il gestionale in questo momento.
 *
 * NON accetta un interno passato dal chiamante: l'interno da cui parte la
 * telefonata si deduce dalla sessione. Altrimenti chiunque potrebbe far partire
 * una chiamata dal telefono di un collega, e la chiamata risulterebbe fatta
 * da lui.
 */
export async function getMyExtension(
  supabase: SupabaseClient,
  identity: ResolvedIdentity,
): Promise<MyExtension> {
  // Il superadmin può operare sul tenant selezionato senza una scheda operatore
  // duplicata. In quel caso non interroghiamo una colonna UUID con una stringa
  // vuota: il chiamante userà l'interno predefinito della struttura.
  if (!identity.userId) return { ok: false, reason: "none", identity }

  const { data } = await supabase
    .from("telephony_user_extensions")
    .select("extension, can_call")
    .eq("property_id", identity.propertyId)
    .eq("user_id", identity.userId)
    .maybeSingle()

  if (!data?.extension) return { ok: false, reason: "none", identity }
  if (data.can_call === false) return { ok: false, reason: "cannot_call", identity }
  return { ok: true, extension: String(data.extension), canCall: true, identity }
}

/**
 * Dalla chiamata alla persona: 3CX comunica l'interno che ha gestito la
 * telefonata, non l'utente del gestionale. Questa e' la traduzione, ed e' cio'
 * che rende il registro attribuibile ("questa chiamata l'ha presa Maria").
 */
export async function findUserIdByExtension(
  supabase: SupabaseClient,
  propertyId: string,
  extension: string,
): Promise<string | null> {
  const clean = normalizeExtension(extension)
  if (!clean) return null

  const { data } = await supabase
    .from("telephony_user_extensions")
    .select("user_id")
    .eq("property_id", propertyId)
    .eq("extension", clean)
    .maybeSingle()

  return (data?.user_id as string) ?? null
}

/**
 * Ripiego: dall'email dell'operatore alla persona.
 *
 * Serve perche' l'attribuzione non deve dipendere dall'aver gia' assegnato tutti
 * gli interni: 3CX invia anche l'email dell'operatore, e in `admin_users`
 * l'email e' unica. Senza questo secondo tentativo il registro resterebbe senza
 * autore per tutte le persone non ancora configurate.
 */
export async function findUserIdByEmail(
  supabase: SupabaseClient,
  propertyId: string,
  email: string,
): Promise<string | null> {
  const clean = email.trim().toLowerCase()
  if (!clean || !clean.includes("@")) return null

  const { data } = await supabase
    .from("admin_users")
    .select("id")
    .eq("property_id", propertyId)
    // Confronto senza distinzione di maiuscole: 3CX puo' inviare
    // "Mario.Rossi@..." mentre in archivio c'e' la forma minuscola, e il
    // confronto esatto fallirebbe senza dare alcun segnale.
    .ilike("email", clean)
    .maybeSingle()

  return (data?.id as string) ?? null
}

/**
 * Riduce l'interno a sole cifre.
 *
 * Necessario perche' 3CX puo' inviare l'interno in forme diverse ("200",
 * "200@dominio", "Interno 200"): confrontare il valore grezzo con quello
 * salvato farebbe fallire il riconoscimento silenziosamente, esattamente
 * l'errore gia' commesso con i numeri di telefono dei contatti.
 * Restituisce "" quando non c'e' nulla di utile, cosi' il chiamante non
 * confronta mai una stringa vuota trovando "tutto".
 */
export function normalizeExtension(value: unknown): string {
  if (typeof value !== "string") return ""
  const digits = value.replace(/[^0-9]/g, "")
  if (digits.length === 0 || digits.length > 10) return ""
  return digits
}
