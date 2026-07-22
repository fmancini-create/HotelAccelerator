/**
 * Autopilot price-change email notifications.
 *
 * Sends a recap email to the configured `notify_emails` whenever a price
 * change is detected, regardless of whether the trigger came from:
 *  - manual save in the UI (`/api/autopilot/trigger`)
 *  - the periodic sync cron (`/api/autopilot/sync`)
 *  - the explicit "Invia al PMS" button (`/api/autopilot/push`)
 *
 * Both `notify` and `autopilot` modes use this same template. In autopilot
 * mode the body shows the actual push result so the recipient knows the PMS
 * was already updated.
 */

import { EmailService } from "@/lib/services/email-service"
import { createServiceRoleClient } from "@/lib/supabase/server"
import type { PriceChange } from "./calculate-suggested-price"
import type { PushResult } from "./push-prices"

interface SendArgs {
  hotelId: string
  hotelName: string
  changes: PriceChange[]
  emails: string[]
  /**
   * Push result. Pass null for `notify` mode (no PMS push happened).
   * Pass the actual result for `autopilot` mode so the email surfaces
   * success/error of the push.
   */
  pushResult?: PushResult | null
  /** Source label printed in the email subject for context. */
  sourceLabel?: string
}

export async function sendPriceChangeEmail({
  hotelName,
  changes,
  emails,
  pushResult,
  sourceLabel,
}: SendArgs): Promise<{ success: boolean }> {
  if (!emails || emails.length === 0) {
    return { success: false }
  }
  if (changes.length === 0) {
    return { success: false }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://santaddeo.vercel.app"

  // Group changes by date for the email
  const byDate: Record<string, PriceChange[]> = {}
  for (const c of changes) {
    if (!byDate[c.date]) byDate[c.date] = []
    byDate[c.date].push(c)
  }

  // Normalizziamo i nomi a title-case per ridurre la quantita' di testo in
  // MAIUSCOLO nel body HTML (regola SpamAssassin UPPERCASE_50_75 -> -0.79).
  const displayHotelName = toTitleCase(hotelName)

  // FIX 01/05/2026 (richiesta utente sera Massabò): colorazione semaforica
  // del suggerito vs attuale per leggibilita' immediata.
  //  - `currentPrice` valorizzato e nuovo > attuale → verde (#16a34a, aumento)
  //  - `currentPrice` valorizzato e nuovo < attuale → rosso (#dc2626, ribasso)
  //  - `currentPrice` valorizzato e nuovo == attuale → grigio (no variazione)
  //  - `currentPrice` null/undef → la combinazione e' NUOVA: mostriamo
  //    "Nuovo" al posto di "N/D" (parla meglio all'utente che vede una mail
  //    e si chiede "perche' non c'e' il valore precedente?") e usiamo il
  //    blu primario (#1e3a5f) per il suggerito, neutro.
  // Aggiungiamo anche un delta % sotto la cella suggerito quando c'e' un
  // confronto significativo (>= 1€), cosi l'utente ha subito il segnale.
  const dateRows = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dateChanges]) => {
      const rows = dateChanges
        .slice(0, 10)
        .map((c) => {
          const hasOld = c.currentPrice != null && c.currentPrice > 0
          const diff = hasOld ? c.suggestedPrice - (c.currentPrice as number) : 0
          const isUp = hasOld && diff > 0
          const isDown = hasOld && diff < 0
          const isFlat = hasOld && diff === 0
          const isNew = !hasOld

          const suggestedColor = isUp
            ? "#16a34a"
            : isDown
              ? "#dc2626"
              : isFlat
                ? "#64748b"
                : "#1e3a5f"
          const arrow = isUp ? "▲" : isDown ? "▼" : ""
          const deltaPct = hasOld && (c.currentPrice as number) > 0
            ? Math.round((diff / (c.currentPrice as number)) * 100)
            : 0
          const deltaLabel = hasOld && Math.abs(diff) >= 1
            ? `<div style="font-size:11px;color:${suggestedColor};font-weight:500;margin-top:2px">${arrow} ${diff > 0 ? "+" : ""}${diff}€ (${deltaPct > 0 ? "+" : ""}${deltaPct}%)</div>`
            : ""

          const currentCell = isNew
            ? `<span style="display:inline-block;padding:2px 8px;background:#dbeafe;color:#1e3a5f;border-radius:10px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.3px">Nuovo</span>`
            : `<span style="color:#475569;font-weight:500">${c.currentPrice}€</span>`

          return `<tr>
              <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(toTitleCase(c.roomTypeName))}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;color:#64748b">${c.occupancy}p</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${currentCell}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">
                <div style="font-weight:bold;color:${suggestedColor};font-size:15px">${c.suggestedPrice}€</div>
                ${deltaLabel}
              </td>
            </tr>`
        })
        .join("")
      const moreCount = dateChanges.length - 10
      return `
        <tr><td colspan="4" style="padding:10px 12px;background:#f8fafc;font-weight:600;color:#1e3a5f">${formatDate(date)}</td></tr>
        ${rows}
        ${moreCount > 0 ? `<tr><td colspan="4" style="padding:6px 12px;color:#94a3b8;font-size:12px;font-style:italic">...e altre ${moreCount} variazioni in questa data</td></tr>` : ""}
      `
    })
    .join("")

  const pushSection = pushResult
    ? `<div style="margin-top:16px;padding:12px;background:${pushResult.success ? "#f0fdf4" : "#fef2f2"};border-radius:8px">
        <strong>${pushResult.success ? "Prezzi inviati al PMS" : "Errore invio PMS"}</strong>
        <br/>Metodo: ${pushResult.method} | Aggiornamenti: ${pushResult.cellsOrRecords}
        ${
          pushResult.errors.length > 0
            ? `<br/><span style="color:#dc2626">${pushResult.errors.slice(0, 5).map(escapeHtml).join("<br/>")}${
                pushResult.errors.length > 5 ? `<br/>...e altri ${pushResult.errors.length - 5}` : ""
              }</span>`
            : ""
        }
      </div>`
    : `<div style="margin-top:16px;padding:12px;background:#fefce8;border-radius:8px;font-size:13px;color:#713f12">
        Modalita&apos; <strong>Notifica</strong>: i prezzi NON sono stati inviati al PMS. Devi inviarli manualmente dalla pagina Pricing.
      </div>`

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto">
      <!-- Brand band: logo Santaddeo su sfondo bianco sopra l'header navy.
           Necessaria una band separata perche' il logo (verde su sfondo chiaro)
           non si legge sul navy #1e293b dell'header titolo. -->
      <div style="background:#ffffff;padding:18px 24px;border:1px solid #e2e8f0;border-bottom:none;border-radius:8px 8px 0 0;text-align:center">
        <img src="${appUrl}/logo-santaddeo.png" alt="Santaddeo" style="height:36px;width:auto;display:inline-block" />
      </div>
      <div style="background:#1e293b;color:white;padding:20px 24px">
        <h2 style="margin:0;font-size:18px">Variazioni Tariffarie - ${escapeHtml(displayHotelName)}</h2>
        <p style="margin:4px 0 0;opacity:0.8;font-size:14px">${changes.length} variazioni rilevate${
          sourceLabel ? ` · ${escapeHtml(sourceLabel)}` : ""
        }</p>
      </div>
      <div style="padding:20px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <thead>
            <tr style="text-align:left">
              <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0">Camera</th>
              <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0;text-align:center">Occ.</th>
              <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0;text-align:right">Attuale</th>
              <th style="padding:8px 12px;border-bottom:2px solid #e2e8f0;text-align:right">Suggerito</th>
            </tr>
          </thead>
          <tbody>${dateRows}</tbody>
        </table>
        ${pushSection}
        <div style="margin-top:20px;text-align:center">
          <a href="${appUrl}/accelerator/pricing" style="display:inline-block;padding:10px 24px;background:#1e293b;color:white;text-decoration:none;border-radius:6px;font-weight:500">
            Apri Tabella Prezzi
          </a>
        </div>
        <p style="margin-top:16px;font-size:12px;color:#94a3b8;text-align:center">
          Questa email e&apos; stata generata automaticamente da Santaddeo Hotel Accelerator.
          <br/>Per modificare le preferenze, vai in Impostazioni Autopilot.
        </p>
      </div>
    </div>
  `

  try {
    const emailService = EmailService.getInstance()

    // List-Unsubscribe header: requisito Gmail/Yahoo per evitare classificazione
    // come bulk. Mailto verso indirizzo di gestione preferenze.
    // RFC 8058: One-Click anche.
    const unsubscribeMail = "unsubscribe@santaddeo.com"
    const settingsUrl = `${appUrl}/settings/notifications`
    const headers: Record<string, string> = {
      "List-Unsubscribe": `<mailto:${unsubscribeMail}?subject=unsubscribe>, <${settingsUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    }

    await emailService.send({
      to: emails,
      subject: `[${displayHotelName}] ${changes.length} variazioni tariffarie${pushResult?.success ? " inviate al PMS" : ""}`,
      html,
      headers,
    })
    return { success: true }
  } catch (err) {
    console.error("[autopilot-email] send error:", err)
    return { success: false }
  }
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-")
  const days = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"]
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return `${days[date.getDay()]} ${d}/${m}/${y}`
}

/**
 * Converte una stringa in title-case in modo idempotente: se è gia' in
 * title/lower-case la ritorna invariata, se è ALL UPPERCASE la converte.
 * Mantiene gli articoli/preposizioni italiani in minuscolo (di, da, e, ...)
 * eccetto come prima parola.
 */
function toTitleCase(s: string): string {
  if (!s) return ""
  // Heuristica: se la stringa ha almeno 1 carattere lowercase, lasciala stare
  // (gia' title-case o mixed-case impostato dall'utente).
  if (/[a-z]/.test(s)) return s
  const small = new Set(["di", "da", "del", "della", "delle", "dei", "degli", "e", "ed", "il", "la", "lo", "i", "gli", "le", "con", "in", "a", "al", "alla", "per", "tra"])
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((word, idx) => {
      if (idx > 0 && small.has(word)) return word
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(" ")
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// ---------------------------------------------------------------------------
// GUARDED SENDER — Email storm protection (12/05/2026)
// ---------------------------------------------------------------------------
//
// Incident: 4 email autopilot a Villa I Barronci in 6 minuti (420 + 420 + 252
// + 966 celle). Root cause: 3 path indipendenti (/api/autopilot/trigger,
// /api/autopilot/sync, lib/pricing/auto-trigger.ts) inviano email senza
// coordinarsi tra loro. I dedup esistenti sono FRAGILI:
//   - hash 3h funziona solo se hash identici (Barronci 19:51:44 vs 19:51:46
//     avevano 420 celle ciascuno ma hash diversi → bypassano).
//   - debounce 60s su autopilot_configs.last_notification_at funziona solo per
//     race ravvicinata (Barronci 19:55:48 vs 19:57:19 = 91s → bypassano).
//   - hash con timestamp di /api/autopilot/sync è sempre unico → inutile.
//
// Soluzione conservativa: wrapper centralizzato attorno a sendPriceChangeEmail
// con TRE protezioni:
//   1. KILL SWITCH globale (env PRICING_EMAIL_PAUSE=true) — stop immediato
//      senza redeploy, leggi-skippa-loga. Utile per arrestare lo storm in
//      corso senza toccare il codice.
//   2. CAS DEBOUNCE configurabile (env PRICING_EMAIL_DEBOUNCE_MINUTES, default
//      15 min). Estende il vecchio CAS 60s che era troppo corto. La logica
//      "non chiudere le righe se debounce attivo" garantisce AGGREGAZIONE
//      naturale: il prossimo cron pesca tutto il backlog accumulato → UNA
//      sola email aggregata invece di N.
//   3. CAP CELLS (env PRICING_EMAIL_MAX_CELLS, default 1500). Sopra di che
//      l'email digest è inutile (centinaia di righe in tabella). Inviamo
//      comunque ma con subject e warning visibile, e troncando il body
//      (il template fa già top 10 per data).
//
// Comportamento dei caller in base a result.reason:
//   "sent"            → marca le righe price_change_log action_taken='email'
//   "kill_switch"     → lascia le righe 'none' (riprese quando ENV rimosso)
//   "debounce_window" → lascia 'none' (aggregate al prossimo cron)
//   "race_lost"       → lascia 'none' (le copre il primo trigger)
//   "send_error"      → lascia 'none' (retry naturale)
//   "no_emails"       → marca 'email' (config dell'hotel: nessun recipient)
//   "no_changes"      → no-op (nessuna riga da marcare)
//
// Manual push button (/api/autopilot/push, /push-range) usa bypassDebounce=true
// perché è una conferma di click utente: non vogliamo che il guard 15min faccia
// sparire la conferma del PMS push appena richiesto. Il kill-switch e il cap
// cells si applicano comunque (cap perché 5000 celle pushate manualmente sono
// rare ma sensate; kill-switch perché vogliamo davvero stop emails TOTALE).
// ---------------------------------------------------------------------------

export type EmailGuardReason =
  | "sent"
  | "kill_switch"
  | "debounce_window"
  | "race_lost"
  | "send_error"
  | "no_emails"
  | "no_changes"
  | "config_error"

export interface EmailGuardResult {
  /** Backward-compat shape: true se l'email è partita davvero. */
  success: boolean
  /** Esplicito alias di success, per chiarezza ai caller. */
  sent: boolean
  reason: EmailGuardReason
  cells: number
  /** Numero di celle che il template ha effettivamente mostrato (digest cap). */
  cellsRendered: number
  /** true se sopra MAX_CELLS e l'email aveva warning di troncamento. */
  truncated: boolean
}

interface GuardOpts {
  /**
   * Salta il debounce automatico (default 60min, configurabile via env
   * PRICING_EMAIL_DEBOUNCE_MINUTES). NON salta kill-switch né cap cells.
   * Usare SOLO per i path "manual button" che mandano una conferma di un click
   * utente esplicito: /api/autopilot/push (click "Invia al PMS" da UI),
   * /api/autopilot/push-range (push range da UI).
   * Nessun cron / sync / auto-trigger deve mai impostare bypassDebounce=true.
   */
  bypassDebounce?: boolean
}

function getDebounceMinutes(): number {
  const raw = process.env.PRICING_EMAIL_DEBOUNCE_MINUTES
  const n = raw ? Number.parseInt(raw, 10) : NaN
  // FIX 12/05/2026 notte (pre-deploy hardening): default alzato da 15 → 60
  // minuti. Razionale: con 15min il cap teorico era ~8 email/2h per hotel,
  // ancora troppo alto per un sistema "calmo". Con 60min: massimo 2 email
  // automatiche/2h per hotel (1 ogni 60min). Il backlog accumulato durante
  // la finestra non viene perso: al ciclo successivo il cron pesca tutte le
  // righe price_change_log ancora `action_taken='none'` e le aggrega in UNA
  // sola email. Se la env var è settata (Vercel Settings → Environment
  // Variables), prevale sul default — utile per smoke test in dev (es. 1min).
  return Number.isFinite(n) && n > 0 ? n : 60
}

function getMaxCells(): number {
  const raw = process.env.PRICING_EMAIL_MAX_CELLS
  const n = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : 1500
}

function isKillSwitchOn(): boolean {
  return (process.env.PRICING_EMAIL_PAUSE || "").trim().toLowerCase() === "true"
}

/**
 * Versione guardata di `sendPriceChangeEmail`. PRINCIPALE punto d'ingresso da
 * usare in tutti i path autopilot per evitare email storm.
 */
export async function sendPriceChangeEmailGuarded(
  args: SendArgs,
  opts?: GuardOpts,
): Promise<EmailGuardResult> {
  const hotelId = args.hotelId
  const cells = args.changes?.length ?? 0
  const emails = args.emails || []
  const bypassDebounce = opts?.bypassDebounce === true

  // (1) Kill switch — ENV var, leggibile da Vercel senza redeploy.
  if (isKillSwitchOn()) {
    // FASE 2 — Log strutturato. NB: kill_switch è l'unico caso in cui il
    // backlog NON viene mai aggregato fino a rimozione esplicita della ENV.
    console.warn(
      `[pricing-email-suppressed] hotel=${hotelId} reason=kill_switch suppressed_count=${cells} aggregated=false rows_kept_as_none=true`,
    )
    return { success: false, sent: false, reason: "kill_switch", cells, cellsRendered: 0, truncated: false }
  }

  // (2) No-op shortcuts.
  if (cells === 0) {
    return { success: false, sent: false, reason: "no_changes", cells: 0, cellsRendered: 0, truncated: false }
  }
  if (emails.length === 0) {
    // No recipients configured for this hotel: tratta come "delivered" per
    // chiudere le righe price_change_log come email (idempotency).
    return { success: false, sent: false, reason: "no_emails", cells, cellsRendered: 0, truncated: false }
  }

  // (3) Cap cells. Se sopra MAX_CELLS, alleggeriamo il body MA non blocchiamo
  // l'invio (il digest fa già top 10 per data, regge fino a ~5000 celle senza
  // collassare la tabella, ma sopra il cap rendiamo evidente all'utente che è
  // un batch enorme). Aggiungiamo un suffisso al sourceLabel per il subject.
  const MAX_CELLS = getMaxCells()
  let renderArgs: SendArgs = args
  let truncated = false
  if (cells > MAX_CELLS) {
    truncated = true
    const truncMsg = `batch grande: ${cells} variazioni`
    renderArgs = {
      ...args,
      // Mantieni TUTTI i cambi nel template (la tabella raggruppa per data
      // e fa già top 10 per data). Aggiungiamo solo il prefisso al
      // sourceLabel per segnalare il batch enorme nel subject.
      sourceLabel: args.sourceLabel ? `${args.sourceLabel} · ${truncMsg}` : truncMsg,
    }
    console.warn(
      `[email-guard] hotel=${hotelId} cells=${cells} max=${MAX_CELLS} truncated=true (subject suffix added)`,
    )
  }

  // (4) Debounce CAS sui path "automatici". Skip per manual push button.
  if (!bypassDebounce) {
    const debounceMin = getDebounceMinutes()
    const debounceCutoffMs = Date.now() - debounceMin * 60_000

    let supabase: any
    try {
      supabase = await createServiceRoleClient()
    } catch (err) {
      console.error(
        `[email-guard] hotel=${hotelId} action=SKIP reason=config_error createServiceRoleClient failed:`,
        err,
      )
      return { success: false, sent: false, reason: "config_error", cells, cellsRendered: 0, truncated }
    }

    const { data: configRow, error: configErr } = await supabase
      .from("autopilot_configs")
      .select("last_notification_at")
      .eq("hotel_id", hotelId)
      .maybeSingle()

    if (configErr) {
      console.error(
        `[email-guard] hotel=${hotelId} action=SKIP reason=config_error read last_notification_at:`,
        configErr.message,
      )
      return { success: false, sent: false, reason: "config_error", cells, cellsRendered: 0, truncated }
    }

    const lastNotifMs = configRow?.last_notification_at
      ? new Date(configRow.last_notification_at as string).getTime()
      : 0

    if (lastNotifMs > debounceCutoffMs) {
      const ageSec = Math.round((Date.now() - lastNotifMs) / 1000)
      // FASE 2 — Log strutturato monitorabile via Vercel Logs filter.
      // `suppressed_count` = numero di celle che SAREBBERO state inviate in
      // questa chiamata ma vengono soppresse. Le righe restano
      // `action_taken='none'` in price_change_log e saranno aggregate al
      // prossimo trigger fuori dalla finestra.
      console.log(
        `[pricing-email-suppressed] hotel=${hotelId} reason=debounce_window suppressed_count=${cells} debounce_minutes=${debounceMin} last_email_age_seconds=${ageSec} aggregated=true rows_kept_as_none=true`,
      )
      return {
        success: false,
        sent: false,
        reason: "debounce_window",
        cells,
        cellsRendered: 0,
        truncated,
      }
    }

    // CAS atomic update: aggiorniamo last_notification_at SOLO se il valore
    // corrente nel DB è ancora quello che abbiamo letto. Se è null usiamo
    // .is(), altrimenti .eq(). Pattern testato in auto-trigger.ts.
    const acquireLockNow = new Date().toISOString()
    let q = supabase
      .from("autopilot_configs")
      .update({ last_notification_at: acquireLockNow })
      .eq("hotel_id", hotelId)
    if (configRow?.last_notification_at == null) {
      q = q.is("last_notification_at", null)
    } else {
      q = q.eq("last_notification_at", configRow.last_notification_at as string)
    }
    const { data: locked, error: lockErr } = await q.select("hotel_id")

    if (lockErr) {
      console.error(
        `[email-guard] hotel=${hotelId} action=SKIP reason=config_error CAS lock error:`,
        lockErr.message,
      )
      return { success: false, sent: false, reason: "config_error", cells, cellsRendered: 0, truncated }
    }
    if (!Array.isArray(locked) || locked.length === 0) {
      // FASE 2 — Log strutturato: stessa famiglia di `debounce_window`,
      // diverso reason. Rows kept 'none' → aggregazione al prossimo ciclo.
      console.log(
        `[pricing-email-suppressed] hotel=${hotelId} reason=race_lost suppressed_count=${cells} debounce_minutes=${debounceMin} aggregated=true rows_kept_as_none=true`,
      )
      return { success: false, sent: false, reason: "race_lost", cells, cellsRendered: 0, truncated }
    }
  }

  // (5) Send. Tutti i guard sono passati.
  const debounceMinForLog = bypassDebounce ? 0 : getDebounceMinutes()
  try {
    const result = await sendPriceChangeEmail(renderArgs)
    if (result.success) {
      // FASE 2 — Log strutturato monitorabile. `debounce_minutes=0` indica
      // manual bypass (click utente), valore positivo indica path automatico.
      console.log(
        `[pricing-email-sent] hotel=${hotelId} changes_count=${cells} debounce_minutes=${debounceMinForLog} bypass=${bypassDebounce} truncated=${truncated}`,
      )
      return { success: true, sent: true, reason: "sent", cells, cellsRendered: cells, truncated }
    }
    console.error(
      `[pricing-email-send-failed] hotel=${hotelId} changes_count=${cells} reason=email_service_returned_false rows_kept_as_none=true`,
    )
    return { success: false, sent: false, reason: "send_error", cells, cellsRendered: 0, truncated }
  } catch (err) {
    console.error(
      `[pricing-email-send-failed] hotel=${hotelId} changes_count=${cells} reason=exception rows_kept_as_none=true error=`,
      err,
    )
    return { success: false, sent: false, reason: "send_error", cells, cellsRendered: 0, truncated }
  }
}
