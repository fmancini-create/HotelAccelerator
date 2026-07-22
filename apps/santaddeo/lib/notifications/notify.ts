/**
 * Helper centralizzato per creare notifiche in-app per gli utenti.
 *
 * Tutte le scritture su `user_notifications` DEVONO passare da qui.
 * Garanzie:
 *  - Service-role client (bypass RLS, ma controllo applicativo del caller)
 *  - Dedup automatico via colonna `dedup_key` + indice unique parziale
 *    (vedi migration enable_rls_user_notifications)
 *  - Logging consistente in console.error per errori non bloccanti
 *
 * NON deve mai lanciare eccezioni: una notifica non riuscita non deve
 * bloccare il flusso applicativo. Ritorna `{ ok, id?, error? }`.
 */

import { createServiceRoleClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"

export type NotificationType =
  // Sales agent
  | "assignment_request_approved"
  | "assignment_request_rejected"
  | "task_due_soon"
  | "task_overdue"
  | "lead_invited_registered"
  | "structure_activated"
  | "commission_paid"
  // Super admin
  | "assignment_request_pending"
  | "agent_invited"
  // Hotel events (opt-in via notification_preferences)
  | "new_booking"
  | "booking_cancelled"
  | "new_review"
  | "new_reviews"
  | "pace_alert"
  // Generic
  | "info"

/**
 * Chiavi della tabella `notification_preferences` che possono pilotare un
 * fan-out di notifiche in-app a tutti gli utenti di un hotel.
 * Aggiungere qui (e nello switch in notifyHotelUsersByPreference) quando
 * si introduce una nuova categoria opt-in.
 */
export type HotelEventPreferenceKey =
  | "new_bookings"
  | "cancellations"
  | "new_reviews"
  | "pace_alerts"

export interface NotifyParams {
  /** UUID dell'auth user destinatario (profiles.id = auth.users.id) */
  userId: string
  type: NotificationType
  title: string
  body?: string | null
  /** URL relativo aperto al click sulla notifica (es. /sales/tasks) */
  actionUrl?: string | null
  /**
   * Chiave di dedup opzionale. Se valorizzata, una seconda chiamata con
   * (userId, dedup_key) uguale NON crea una nuova notifica (upsert idempotente).
   * Usata principalmente dal cron task-scaduti.
   */
  dedupKey?: string | null
}

export interface NotifyResult {
  ok: boolean
  id?: string
  deduped?: boolean
  error?: string
}

/**
 * Crea una notifica per un singolo utente. Se `dedupKey` matcha una
 * notifica esistente, ritorna `{ ok: true, deduped: true }` senza fare nulla.
 */
export async function notifyUser(params: NotifyParams): Promise<NotifyResult> {
  if (!params.userId || !params.type || !params.title) {
    return { ok: false, error: "missing_required_fields" }
  }

  try {
    const svc = await createServiceRoleClient()

    // Insert con onConflict (user_id, dedup_key) -> ignore.
    // Quando dedupKey e' null l'indice unique parziale non si applica e
    // l'insert riesce sempre.
    const row: Record<string, any> = {
      user_id: params.userId,
      type: params.type,
      title: params.title.slice(0, 200),
      body: params.body ? String(params.body).slice(0, 2000) : null,
      action_url: params.actionUrl ?? null,
      dedup_key: params.dedupKey ?? null,
      is_read: false,
    }

    const { data, error } = await svc
      .from("user_notifications")
      .insert(row)
      .select("id")
      .single()

    if (error) {
      // 23505 = unique_violation -> e' il caso di dedup, lo trattiamo come ok
      if ((error as any).code === "23505") {
        return { ok: true, deduped: true }
      }
      console.error("[notify] insert failed:", error.message, "user=", params.userId, "type=", params.type)
      return { ok: false, error: error.message }
    }

    return { ok: true, id: data?.id, deduped: false }
  } catch (e: any) {
    console.error("[notify] unexpected error:", e?.message ?? String(e))
    return { ok: false, error: e?.message ?? "unexpected" }
  }
}

/**
 * Variante batch: crea la stessa notifica per piu' utenti (utile per
 * notifiche al "gruppo super_admin" o ad agent collegati a un evento).
 * Esegue insert in chunk da 200 (limite sicuro PostgREST).
 */
export async function notifyUsers(
  userIds: string[],
  params: Omit<NotifyParams, "userId">,
): Promise<{ ok: boolean; created: number; deduped: number; failed: number }> {
  const unique = Array.from(new Set(userIds.filter(Boolean)))
  if (unique.length === 0) return { ok: true, created: 0, deduped: 0, failed: 0 }

  let created = 0
  let deduped = 0
  let failed = 0

  for (const uid of unique) {
    const r = await notifyUser({ userId: uid, ...params })
    if (r.ok) {
      if (r.deduped) deduped++
      else created++
    } else {
      failed++
    }
  }

  return { ok: failed === 0, created, deduped, failed }
}

/**
 * Recupera tutti gli auth user id che hanno accesso a un dato hotel.
 * Usa entrambi i sistemi di authorization (in linea con
 * `lib/auth/validateHotelAccess.ts`):
 *   1) NEW: `hotel_users` (junction table user_id<->hotel_id)
 *   2) OLD: `profiles.organization_id` -> `hotels.organization_id`
 * Esclude esplicitamente i super_admin perche' non sono operativi sulla
 * singola struttura (riceverebbero rumore per ogni hotel del sistema).
 */
export async function getHotelUserIds(hotelId: string): Promise<string[]> {
  if (!hotelId) return []
  try {
    const svc = await createServiceRoleClient()
    const ids = new Set<string>()

    // 1) hotel_users
    const { data: hu, error: huErr } = await svc
      .from("hotel_users")
      .select("user_id")
      .eq("hotel_id", hotelId)
    if (huErr) {
      console.error("[notify] getHotelUserIds hotel_users error:", huErr.message)
    }
    for (const row of hu ?? []) {
      if (row?.user_id) ids.add(row.user_id as string)
    }

    // 2) profiles via organization_id del hotel
    const { data: hotel } = await svc
      .from("hotels")
      .select("organization_id")
      .eq("id", hotelId)
      .maybeSingle()
    const orgId = (hotel as any)?.organization_id as string | null | undefined
    if (orgId) {
      const { data: profs } = await svc
        .from("profiles")
        .select("id, role")
        .eq("organization_id", orgId)
      for (const p of profs ?? []) {
        const role = (p as any)?.role as string | undefined
        if (role === "super_admin" || role === "superadmin") continue
        if ((p as any)?.id) ids.add((p as any).id as string)
      }
    }

    return Array.from(ids)
  } catch (e: any) {
    console.error("[notify] getHotelUserIds exception:", e?.message)
    return []
  }
}

/**
 * Risolve l'indirizzo email di uno o piu' utenti.
 *
 * Fonte primaria: `profiles.email`. Fallback: Supabase Auth (auth.users via
 * admin API), perche' `profiles.email` puo' essere NULL/vuoto per utenti
 * storici mentre l'email di login esiste sempre lato Auth. Questo era il
 * motivo per cui il promemoria KPI OTA non inviava email: il cron leggeva
 * solo `profiles.email` (vuoto) e saltava `sendEmail`.
 *
 * Ritorna una Map userId -> email (solo per gli utenti con email trovata).
 */
export async function resolveUserEmails(
  svc: Awaited<ReturnType<typeof createServiceRoleClient>>,
  userIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = Array.from(new Set(userIds.filter(Boolean)))
  if (unique.length === 0) return out

  // 1) profiles.email (batch)
  try {
    const { data: profs } = await svc.from("profiles").select("id, email").in("id", unique)
    for (const p of profs ?? []) {
      const email = (p as any)?.email
      if (email && String(email).trim()) out.set((p as any).id as string, String(email).trim())
    }
  } catch (e: any) {
    console.error("[notify] resolveUserEmails profiles error:", e?.message)
  }

  // 2) Fallback su Auth per chi non ha email nel profilo
  const missing = unique.filter((id) => !out.has(id))
  for (const id of missing) {
    try {
      const { data, error } = await svc.auth.admin.getUserById(id)
      const email = data?.user?.email
      if (!error && email && email.trim()) out.set(id, email.trim())
    } catch (e: any) {
      console.error("[notify] resolveUserEmails auth fallback error:", id, e?.message)
    }
  }

  return out
}

/**
 * Fan-out di una notifica in-app a tutti gli utenti di un hotel che hanno
 * abilitato la preferenza popup corrispondente in `notification_preferences`.
 *
 * Le notifiche di evento PMS / recensioni sono OPT-IN: se l'utente non ha
 * mai aperto /settings/notifications, le sue preferenze per queste categorie
 * sono false (default colonna) e non viene notificato. Questo evita rumore
 * per tutti gli utenti esistenti dopo il rollout.
 *
 * `dedupKeyBase` viene usato per costruire una dedup key per-utente
 * (es. `booking_<pms_id>` -> `booking_<pms_id>:<user_id>`). In questo modo
 * la stessa prenotazione non genera mai due notifiche per lo stesso utente
 * anche se il job ETL gira piu' volte sullo stesso raw record.
 */
export async function notifyHotelUsersByPreference(args: {
  hotelId: string
  preferenceKey: HotelEventPreferenceKey
  type: NotificationType
  title: string
  body?: string | null
  actionUrl?: string | null
  dedupKeyBase: string
  /** Oggetto email custom. Default: `title`. */
  emailSubject?: string | null
}): Promise<{ ok: boolean; created: number; deduped: number; skipped: number; emailed: number }> {
  const { hotelId, preferenceKey, type, title, body, actionUrl, dedupKeyBase, emailSubject } = args
  if (!hotelId || !preferenceKey || !type || !title || !dedupKeyBase) {
    return { ok: false, created: 0, deduped: 0, skipped: 0, emailed: 0 }
  }

  try {
    const userIds = await getHotelUserIds(hotelId)
    if (userIds.length === 0) return { ok: true, created: 0, deduped: 0, skipped: 0, emailed: 0 }

    const popupCol = `${preferenceKey}_popup` // es. "new_bookings_popup"
    const emailCol = `${preferenceKey}_email` // es. "new_bookings_email"
    const svc = await createServiceRoleClient()

    // Carica TUTTE le preferenze degli utenti del hotel in un'unica query.
    // Gli utenti senza riga in notification_preferences hanno popup/email =
    // default della colonna (per le 3 categorie nuove = FALSE), quindi NON
    // ricevono nulla finche' non attivano esplicitamente i toggle.
    const { data: prefsRows, error: prefsErr } = await svc
      .from("notification_preferences")
      .select(`user_id, ${popupCol}, ${emailCol}`)
      .eq("hotel_id", hotelId)
      .in("user_id", userIds)
    if (prefsErr) {
      console.error("[notify] notifyHotelUsersByPreference prefs error:", prefsErr.message)
      return { ok: false, created: 0, deduped: 0, skipped: 0, emailed: 0 }
    }

    const optedInPopup = new Set<string>()
    const optedInEmail = new Set<string>()
    for (const row of prefsRows ?? []) {
      const uid = (row as any).user_id as string | undefined
      if (!uid) continue
      if ((row as any)[popupCol] === true) optedInPopup.add(uid)
      if ((row as any)[emailCol] === true) optedInEmail.add(uid)
    }

    let created = 0
    let deduped = 0
    let skipped = 0
    let emailed = 0

    // ── Notifiche in-app (popup) ────────────────────────────────────────────
    for (const uid of userIds) {
      if (!optedInPopup.has(uid)) {
        skipped++
        continue
      }
      const r = await notifyUser({
        userId: uid,
        type,
        title,
        body: body ?? null,
        actionUrl: actionUrl ?? null,
        dedupKey: `${dedupKeyBase}:${uid}`,
      })
      if (r.ok) {
        if (r.deduped) deduped++
        else created++
      }
    }

    // ── Email (canale separato, opt-in via `${preferenceKey}_email`) ─────────
    // Prima questo ramo non esisteva: i toggle "Email" in /settings/notifications
    // non inviavano nulla. Ora risolviamo l'email (profilo + fallback Auth) e
    // inviamo a chi ha abilitato l'email per questa categoria.
    if (optedInEmail.size > 0) {
      const emailUserIds = Array.from(optedInEmail)
      const emails = await resolveUserEmails(svc, emailUserIds)

      // Nome hotel per un oggetto/email piu' chiari.
      let hotelName = "la tua struttura"
      try {
        const { data: hotel } = await svc.from("hotels").select("name").eq("id", hotelId).maybeSingle()
        if ((hotel as any)?.name) hotelName = (hotel as any).name
      } catch {
        /* best-effort */
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.santaddeo.com"
      const fullActionUrl = actionUrl ? `${appUrl}${actionUrl}` : appUrl
      const subject = (emailSubject || title).slice(0, 200)

      for (const uid of emailUserIds) {
        const to = emails.get(uid)
        if (!to) continue
        const res = await sendEmail({
          to,
          subject: `[${hotelName}] ${subject}`,
          html: buildHotelEventEmailHtml({ hotelName, title, body: body ?? null, actionUrl: fullActionUrl }),
          type: `notif_${preferenceKey}`,
          hotelId,
          userId: uid,
          metadata: { preferenceKey, dedupKeyBase },
        })
        if (res.success) emailed++
      }
    }

    return { ok: true, created, deduped, skipped, emailed }
  } catch (e: any) {
    console.error("[notify] notifyHotelUsersByPreference exception:", e?.message)
    return { ok: false, created: 0, deduped: 0, skipped: 0, emailed: 0 }
  }
}

/**
 * Template HTML minimale e brandizzato per le email di evento hotel
 * (nuove prenotazioni / cancellazioni / nuove recensioni).
 */
function buildHotelEventEmailHtml(params: {
  hotelName: string
  title: string
  body?: string | null
  actionUrl: string
}): string {
  const { hotelName, title, body, actionUrl } = params
  const safe = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  // Il body puo' contenere piu' righe separate da "\n" (es. una per mese):
  // le rendiamo come righe distinte invece di un unico blocco illeggibile.
  const bodyHtml = body
    ? safe(body)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => `<p style="line-height: 1.6; font-size: 14px; color:#333; margin:0 0 8px 0;">${line}</p>`)
        .join("")
    : ""
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
      <p style="color:#666; font-size:12px; margin:0 0 8px 0; text-transform:uppercase; letter-spacing:0.04em;">${safe(hotelName)}</p>
      <h2 style="margin: 0 0 12px 0; font-size: 18px;">${safe(title)}</h2>
      ${bodyHtml}
      <p style="margin: 24px 0;">
        <a href="${actionUrl}" style="display:inline-block; background:#111; color:#fff; padding:12px 20px; text-decoration:none; border-radius:6px; font-size:14px;">Apri in SANTADDEO</a>
      </p>
      <p style="color:#666; font-size:12px; line-height:1.6;">
        Ricevi questa email perche' hai attivato le notifiche email per questa categoria
        in Impostazioni &rarr; Notifiche. Puoi disattivarle in ogni momento.
      </p>
    </div>
  `
}

/**
 * Helper: recupera gli auth user id di tutti i super_admin attivi.
 * Usato per notificare l'admin di eventi come "richiesta assegnazione pending".
 */
export async function getSuperAdminUserIds(): Promise<string[]> {
  try {
    const svc = await createServiceRoleClient()
    const { data, error } = await svc
      .from("profiles")
      .select("id")
      .eq("role", "super_admin")
    if (error) {
      console.error("[notify] getSuperAdminUserIds error:", error.message)
      return []
    }
    return (data ?? []).map((r: any) => r.id)
  } catch (e: any) {
    console.error("[notify] getSuperAdminUserIds exception:", e?.message)
    return []
  }
}
