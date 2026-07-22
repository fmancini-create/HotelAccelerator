import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/cron-auth"
import { sendEmail } from "@/lib/email/send-email"
import { resolveUserEmails } from "@/lib/notifications/notify"
import { getKVariableSourceMetadata } from "@/lib/pricing/k-variable-source-metadata"

export const runtime = "nodejs"
export const maxDuration = 60
export const dynamic = "force-dynamic"

// Etichette leggibili per piattaforma OTA. Default = chiave grezza.
const PLATFORM_LABELS: Record<string, string> = {
  booking_com: "Booking.com",
  expedia: "Expedia",
  airbnb: "Airbnb",
  google: "Google",
}

// Soglia di obsolescenza dei report OTA: oltre questi giorni la variabile di
// pricing "Visibilita OTA" viene BLOCCATA su 5 (neutro). La leggiamo dalla
// stessa fonte di verita' usata dalla UI/status (k_ota_views.freshnessDays = 35)
// per restare sempre in sync: se cambia li', cambia anche il promemoria.
const OTA_STALE_DAYS = getKVariableSourceMetadata("k_ota_views")?.freshnessDays || 35
// Per non assillare ogni giorno quando i dati sono scaduti, mandiamo il
// promemoria "da staleness" al massimo una volta ogni N giorni.
const STALENESS_REMINDER_COOLDOWN_DAYS = 7

/**
 * OTA reminder cron.
 *
 * Runs daily and fires reminders whose `next_run_at` is due. For each due
 * reminder we:
 *   1. Insert an in-app notification for the user who configured the reminder
 *   2. Optionally send an email (only if email_enabled is true for that user)
 *   3. Advance `next_run_at` by `frequency_days` to avoid double-firing
 *
 * The scheduler is idempotent: if the cron is replayed on the same day, the
 * `next_run_at > now()` filter will skip already-processed reminders.
 */
export async function GET(request: Request) {
  // Protect cron endpoint
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

  const supabase = await createServiceRoleClient()
  const now = new Date()
  const nowIso = now.toISOString()

  // FIX 29/06/2026: oltre ai promemoria scaduti per TIMER (next_run_at), ora
  // facciamo scattare un promemoria anche quando i REPORT OTA sono OBSOLETI
  // oltre la soglia che BLOCCA la variabile di pricing (OTA_STALE_DAYS=35).
  // Cosi' l'utente non resta scoperto se il timer e' lontano. Per questo
  // carichiamo TUTTI i promemoria attivi (non solo quelli due-by-timer) e
  // decidiamo per riga.
  const { data: active, error } = await supabase
    .from("ota_reminder_settings")
    .select(
      "id, user_id, hotel_id, platform, frequency_days, email_enabled, popup_enabled, next_run_at, last_triggered_at",
    )
    .eq("is_active", true)

  if (error) {
    console.error("[v0] ota-reminders fetch error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!active || active.length === 0) {
    return NextResponse.json({ processed: 0, timestamp: nowIso })
  }

  // Staleness dei report OTA per-hotel (cache: piu' promemoria possono puntare
  // allo stesso hotel). days_since = giorni dall'ultimo snapshot caricato.
  const otaStaleDaysByHotel = new Map<string, number | null>()
  async function otaDaysSinceLastReport(hotelId: string): Promise<number | null> {
    if (otaStaleDaysByHotel.has(hotelId)) return otaStaleDaysByHotel.get(hotelId)!
    const { data: snap } = await supabase
      .from("hotel_ota_kpi_snapshots")
      .select("period_end, created_at")
      .eq("hotel_id", hotelId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const lastAt = snap?.created_at ?? snap?.period_end ?? null
    const days = lastAt ? Math.floor((now.getTime() - new Date(lastAt).getTime()) / 86400000) : null
    otaStaleDaysByHotel.set(hotelId, days)
    return days
  }

  function daysSince(iso: string | null): number | null {
    if (!iso) return null
    const t = new Date(iso).getTime()
    if (Number.isNaN(t)) return null
    return Math.floor((now.getTime() - t) / 86400000)
  }

  // Per ogni riga decidiamo se inviare e per quale motivo (timer vs staleness).
  const due: Array<
    (typeof active)[number] & { _reason: "timer" | "stale"; _staleDays: number | null }
  > = []
  for (const r of active) {
    const dueByTimer = !!r.next_run_at && r.next_run_at <= nowIso
    // Staleness: nessun report mai caricato (null) o piu' vecchio di OTA_STALE_DAYS.
    const staleDays = await otaDaysSinceLastReport(r.hotel_id)
    const isStale = staleDays === null || staleDays > OTA_STALE_DAYS
    const sinceLastReminder = daysSince(r.last_triggered_at)
    const cooldownOk = sinceLastReminder === null || sinceLastReminder >= STALENESS_REMINDER_COOLDOWN_DAYS
    const dueByStaleness = isStale && cooldownOk
    if (dueByTimer || dueByStaleness) {
      due.push({ ...r, _reason: dueByTimer ? "timer" : "stale", _staleDays: staleDays })
    }
  }

  if (due.length === 0) {
    return NextResponse.json({ processed: 0, timestamp: nowIso })
  }

  const results: Array<{ id: string; status: string; detail?: string }> = []

  for (const r of due) {
    try {
      // Fetch hotel info + risolvi l'email del destinatario.
      // FIX 15/06/2026: l'email veniva letta SOLO da `profiles.email`. Per gli
      // utenti storici quella colonna era vuota -> il cron saltava `sendEmail`
      // (popup creato, scheduler avanzato, ma nessuna email). Ora usiamo
      // `resolveUserEmails` che fa fallback su Supabase Auth (auth.users),
      // dove l'email di login esiste sempre.
      const { data: hotel } = await supabase
        .from("hotels")
        .select("id, name")
        .eq("id", r.hotel_id)
        .single()
      const emailMap = await resolveUserEmails(supabase, [r.user_id])
      const recipientEmail = emailMap.get(r.user_id) ?? null

      const hotelName = hotel?.name ?? "la tua struttura"
      const platformLabel = PLATFORM_LABELS[r.platform] ?? r.platform

      // Messaggio diverso a seconda del motivo: se i dati sono OBSOLETI e stanno
      // bloccando il pricing, lo diciamo esplicitamente (piu' urgente del solito
      // promemoria periodico).
      const isStaleReason = r._reason === "stale"
      const title = isStaleReason
        ? `KPI ${platformLabel} scaduti: pricing bloccato per ${hotelName}`
        : `Aggiorna i KPI ${platformLabel} di ${hotelName}`
      const body = isStaleReason
        ? `${
            r._staleDays === null
              ? "Non risultano report OTA caricati"
              : `L'ultimo report OTA risale a ${r._staleDays} giorni fa`
          }: la variabile "Visibilita OTA" del pricing e' bloccata su 5 (neutro). Carica i KPI aggiornati dall'Extranet per riattivarla.`
        : `Sono passati ${r.frequency_days} giorni. Inserisci i nuovi KPI dall'Extranet e carica il report PDF.`
      // Booking ha il suo tab dedicato; le altre OTA usano il tab generico.
      const actionUrl =
        r.platform === "booking_com"
          ? "/settings/advanced?tab=booking"
          : `/settings/advanced?tab=ota&platform=${r.platform}`

      // 1) In-app notification (always, if popup_enabled)
      if (r.popup_enabled) {
        await supabase.from("user_notifications").insert({
          user_id: r.user_id,
          hotel_id: r.hotel_id,
          type: "ota_reminder",
          title,
          body,
          action_url: actionUrl,
        })
      }

      // 2) Email (only if the reminder author opted in)
      if (r.email_enabled && recipientEmail) {
        await sendEmail({
          to: recipientEmail,
          subject: isStaleReason
            ? `KPI ${platformLabel} scaduti: pricing bloccato`
            : `Promemoria: aggiorna i KPI ${platformLabel}`,
          html: buildEmailHtml({
            hotelName,
            platformLabel,
            frequencyDays: r.frequency_days,
            actionUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.santaddeo.com"}${actionUrl}`,
          }),
          type: "ota_reminder",
          hotelId: r.hotel_id,
          userId: r.user_id,
          metadata: { platform: r.platform, frequencyDays: r.frequency_days },
        })
      } else if (r.email_enabled && !recipientEmail) {
        console.warn("[v0] ota-reminder: nessuna email risolta per user", r.user_id)
      }

      // 3) Avanza lo scheduling. last_triggered_at = ora SEMPRE (serve sia per
      // la cadenza periodica sia per il cooldown dei promemoria da staleness).
      // next_run_at: lo spostiamo in avanti SOLO se questo invio era dovuto al
      // TIMER. Se era un promemoria "da staleness" lasciamo next_run_at invariato
      // cosi' il promemoria periodico avviene comunque alla sua scadenza.
      const update: Record<string, string> = {
        last_triggered_at: nowIso,
        updated_at: nowIso,
      }
      if (r._reason === "timer") {
        const next = new Date()
        next.setUTCDate(next.getUTCDate() + r.frequency_days)
        update.next_run_at = next.toISOString()
      }
      await supabase.from("ota_reminder_settings").update(update).eq("id", r.id)

      results.push({ id: r.id, status: "sent", detail: r._reason })
    } catch (err: any) {
      console.error("[v0] ota-reminder failure for", r.id, err)
      results.push({ id: r.id, status: "error", detail: err?.message ?? String(err) })
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
    timestamp: nowIso,
  })
}

function buildEmailHtml(params: {
  hotelName: string
  platformLabel: string
  frequencyDays: number
  actionUrl: string
}) {
  const { hotelName, platformLabel, frequencyDays, actionUrl } = params
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
      <h2 style="margin: 0 0 16px 0; font-size: 20px;">Promemoria KPI ${platformLabel}</h2>
      <p style="line-height: 1.6; font-size: 14px;">
        Sono passati <strong>${frequencyDays} giorni</strong> dall'ultimo aggiornamento dei KPI ${platformLabel}
        per <strong>${hotelName}</strong>.
      </p>
      <p style="line-height: 1.6; font-size: 14px;">
        Collega l'Extranet, copia i 3 numeri dalla Dashboard ranking (Visualizzazioni
        ricerca, Visualizzazioni struttura, Prenotazioni) e carica il PDF del
        &quot;Report sull'andamento&quot; a 30 giorni con confronto anno precedente.
      </p>
      <p style="margin: 24px 0;">
        <a href="${actionUrl}" style="display: inline-block; background: #111; color: #fff; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-size: 14px;">Apri il modulo KPI</a>
      </p>
      <p style="color: #666; font-size: 12px; line-height: 1.6;">
        Ricevi questo promemoria perché lo hai configurato nelle impostazioni di
        integrazione. Puoi modificarne la frequenza o disattivarlo in ogni momento.
      </p>
    </div>
  `
}
