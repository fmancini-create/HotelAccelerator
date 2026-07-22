import "server-only"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getEventRecap, getDriveDocText, isGoogleCalendarConfigured } from "@/lib/google/calendar"
import { recordLeadActivity } from "@/lib/sales/lead-messages"

/**
 * Collega automaticamente il RIEPILOGO della call (note di Gemini + eventuale
 * registrazione) alla CRONOLOGIA del lead.
 *
 * Fonte dati CERTA (verificata): quando in Google Meet Gemini prende appunti, il
 * Doc "Appunti di Gemini" (e la registrazione, se attiva) viene allegato
 * automaticamente all'EVENTO di Google Calendar dell'organizzatore
 * (clienti@4bid.it). Noi colleghiamo l'evento alla demo tramite
 * demo_requests.google_event_id (match ESATTO) e da li' al lead
 * (demo_requests.lead_id). Nessun parsing di email, nessuna euristica: se non
 * c'e' una demo della piattaforma con quel google_event_id, NON attribuiamo
 * nulla (regola "dati certi").
 *
 * Il TESTO del riepilogo viene letto dal Doc via Drive API (getDriveDocText):
 * se lo scope Drive non e' ancora autorizzato nella Domain-Wide Delegation,
 * salviamo comunque il LINK al Doc (e la registrazione) e il testo verra'
 * aggiunto appena lo scope sara' abilitato. Mai contenuti inventati.
 *
 * Idempotente: una sola voce di cronologia per evento (dedup su
 * metadata.recap_event_id). Best-effort per ogni demo: un errore non blocca le
 * altre.
 */

export interface LinkCallRecapsResult {
  enabled: boolean
  checked: number
  linked: number
  withText: number
  errors: number
}

export async function linkCallRecaps(options?: {
  /** Quante demo passate guardare a ritroso (default 30 giorni). */
  sinceDays?: number
  /** Limite di demo per esecuzione. */
  maxDemos?: number
  /**
   * Se valorizzato, collega i recap SOLO per le demo di questo lead. Usato per
   * l'aggancio ON-DEMAND quando si apre la Cronologia del lead (il recap compare
   * subito, senza attendere il cron da 30 minuti).
   */
  leadId?: string
}): Promise<LinkCallRecapsResult> {
  const result: LinkCallRecapsResult = { enabled: false, checked: 0, linked: 0, withText: 0, errors: 0 }
  if (!isGoogleCalendarConfigured()) {
    console.warn("[call-recaps] Google Calendar non configurato: skip")
    return result
  }
  result.enabled = true

  const sinceDays = options?.sinceDays ?? 30
  const maxDemos = options?.maxDemos ?? 100
  const svc = await createServiceRoleClient()

  const nowIso = new Date().toISOString()
  const cutoffIso = new Date(Date.now() - sinceDays * 24 * 3600 * 1000).toISOString()

  // Demo della piattaforma GIA' avvenute (call finita) con evento Google e lead.
  let query = svc
    .from("demo_requests")
    .select("id, title, requested_start, requested_end, google_event_id, lead_id")
    .not("google_event_id", "is", null)
    .not("lead_id", "is", null)
    .lte("requested_end", nowIso)
    .gte("requested_end", cutoffIso)
    .order("requested_end", { ascending: false })
    .limit(maxDemos)
  if (options?.leadId) query = query.eq("lead_id", options.leadId)

  const { data: demos, error } = await query

  if (error) {
    console.error("[call-recaps] query demo_requests error:", error.message)
    result.errors++
    return result
  }

  for (const demo of demos ?? []) {
    result.checked++
    const eventId = demo.google_event_id as string
    const leadId = demo.lead_id as string
    try {
      // Dedup: gia' collegato il riepilogo di questo evento?
      const { data: existing } = await svc
        .from("sales_lead_activities")
        .select("id, content, metadata")
        .eq("lead_id", leadId)
        .filter("metadata->>recap_event_id", "eq", eventId)
        .limit(1)
        .maybeSingle()
      if (existing) {
        // BACKFILL TESTO: il recap era stato collegato senza testo (scope Drive
        // non ancora attivo). Ora che lo scope c'e', recuperiamo il testo dal
        // Doc e aggiorniamo l'attivita' esistente, una sola volta.
        const meta = (existing.metadata ?? {}) as Record<string, unknown>
        const docId = meta.recap_doc_id as string | undefined
        if (!meta.has_text && docId) {
          const backfillText = await getDriveDocText(docId)
          if (backfillText) {
            const text = backfillText.length > 8000 ? backfillText.slice(0, 8000) + "\n…" : backfillText
            const title = (demo.title as string) || "Demo"
            const header = `Riepilogo call (Gemini) — ${title}`
            await svc
              .from("sales_lead_activities")
              .update({
                content: `${header}\n\n${text}`,
                metadata: { ...meta, has_text: true },
              })
              .eq("id", existing.id)
            result.withText++
            result.linked++
          }
        }
        continue
      }

      const recap = await getEventRecap(eventId)
      const primaryDoc = recap.notesDocs[0] ?? null
      const recording = recap.recordings[0] ?? null
      // Niente note ne' registrazione: la call potrebbe non avere ancora il
      // riepilogo pronto. Riproveremo alla prossima esecuzione.
      if (!primaryDoc && !recording) continue

      // Proprietario certo: il venditore del lead.
      const { data: lead } = await svc
        .from("sales_leads")
        .select("sales_agent_id")
        .eq("id", leadId)
        .maybeSingle()
      const salesAgentId = (lead?.sales_agent_id as string | undefined) ?? null

      // Testo del riepilogo (solo se lo scope Drive e' autorizzato).
      let recapText: string | null = null
      if (primaryDoc?.fileId) {
        recapText = await getDriveDocText(primaryDoc.fileId)
        if (recapText && recapText.length > 8000) recapText = recapText.slice(0, 8000) + "\n…"
      }
      if (recapText) result.withText++

      const title = (demo.title as string) || "Demo"
      const header = `Riepilogo call (Gemini) — ${title}`
      const content = recapText ? `${header}\n\n${recapText}` : header

      await recordLeadActivity({
        svc,
        leadId,
        salesAgentId,
        type: "call",
        content,
        metadata: {
          source: "gemini_recap",
          recap_event_id: eventId,
          recap_doc_url: primaryDoc?.fileUrl ?? null,
          recap_doc_id: primaryDoc?.fileId ?? null,
          recap_doc_title: primaryDoc?.title ?? null,
          recording_url: recording?.fileUrl ?? null,
          has_text: Boolean(recapText),
          demo_id: demo.id,
        },
      })
      result.linked++
    } catch (e) {
      result.errors++
      console.error("[call-recaps] errore su demo", demo.id, e instanceof Error ? e.message : e)
    }
  }

  console.log("[call-recaps] done:", JSON.stringify(result))
  return result
}

/** Estrae il titolo della demo dall'oggetto della mail Gemini: Note: "<titolo>". */
export function parseGeminiRecapSubject(subject?: string | null): string | null {
  if (!subject) return null
  // Es: Note: "Demo Santaddeo - Jada Hotels" 18 giu 2026
  const m = subject.match(/note[:\s]*[“"«](.+?)[”"»]/i)
  return m?.[1]?.trim() || null
}

/** Riconosce una mail di riepilogo Gemini dall'oggetto/mittente. */
export function isGeminiRecapEmail(opts: { subject?: string | null; fromEmail?: string | null }): boolean {
  const subj = opts.subject || ""
  if (parseGeminiRecapSubject(subj)) return true
  // fallback: mittente Google + oggetto che parla di note riunione
  const from = (opts.fromEmail || "").toLowerCase()
  return /google\.com$/.test(from) && /note|riunione|meeting|notes/i.test(subj)
}

/** Primo link a un Google Doc trovato nel testo/HTML della mail. */
function extractDocUrl(...sources: Array<string | null | undefined>): string | null {
  for (const s of sources) {
    if (!s) continue
    const m = s.match(/https:\/\/docs\.google\.com\/document\/[^\s"'<>)]+/i)
    if (m) return m[0]
  }
  return null
}

export interface LinkGeminiEmailResult {
  matched: boolean
  reason?: string
}

/**
 * Collega alla cronologia del lead il RIEPILOGO Gemini ricevuto VIA EMAIL su
 * clienti@4bid.it. A differenza del percorso calendario, qui abbiamo il TESTO
 * del riepilogo nel corpo della mail (contenuto REALE, via mailparser — mai
 * inventato) anche senza lo scope Drive.
 *
 * Abbinamento alla demo: titolo estratto dall'oggetto (`Note: "<titolo>"`)
 * confrontato con demo_requests.title, scegliendo la demo con lead_id la cui
 * data e' piu' vicina alla data della mail (entro una finestra). Se non si
 * trova una demo certa con lead, NON si attribuisce nulla (regola dati certi):
 * si ritorna matched=false e la mail resta gestita altrove.
 *
 * Dedup unificata col percorso calendario: usa metadata.recap_event_id =
 * demo.google_event_id, cosi' la stessa call non viene mai registrata due volte
 * (qualunque dei due percorsi giri per primo).
 */
export async function linkGeminiRecapEmail(input: {
  subject: string | null
  bodyText: string | null
  bodyHtml: string | null
  receivedAt: string
  messageId: string | null
}): Promise<LinkGeminiEmailResult> {
  const title = parseGeminiRecapSubject(input.subject)
  if (!title) return { matched: false, reason: "no_title" }

  const svc = await createServiceRoleClient()
  const received = new Date(input.receivedAt)
  // Finestra: la demo si e' svolta tra 2 giorni prima e poche ore dopo la mail.
  const fromIso = new Date(received.getTime() - 2 * 24 * 3600 * 1000).toISOString()
  const toIso = new Date(received.getTime() + 6 * 3600 * 1000).toISOString()

  const { data: demos } = await svc
    .from("demo_requests")
    .select("id, title, requested_start, google_event_id, lead_id")
    .ilike("title", title)
    .not("lead_id", "is", null)
    .gte("requested_start", fromIso)
    .lte("requested_start", toIso)
    .order("requested_start", { ascending: false })
    .limit(1)

  const demo = demos?.[0]
  if (!demo) return { matched: false, reason: "no_demo_match" }

  const leadId = demo.lead_id as string
  const eventId = (demo.google_event_id as string | null) ?? null

  // Dedup: per recap_event_id (unifica col percorso calendario) o, se la demo
  // non ha event id, per il message-id della mail.
  if (eventId) {
    const { data: existing } = await svc
      .from("sales_lead_activities")
      .select("id")
      .eq("lead_id", leadId)
      .filter("metadata->>recap_event_id", "eq", eventId)
      .limit(1)
      .maybeSingle()
    if (existing) return { matched: true, reason: "already_linked" }
  } else if (input.messageId) {
    const { data: existing } = await svc
      .from("sales_lead_activities")
      .select("id")
      .eq("lead_id", leadId)
      .filter("metadata->>recap_email_message_id", "eq", input.messageId)
      .limit(1)
      .maybeSingle()
    if (existing) return { matched: true, reason: "already_linked" }
  }

  const { data: lead } = await svc
    .from("sales_leads")
    .select("sales_agent_id")
    .eq("id", leadId)
    .maybeSingle()
  const salesAgentId = (lead?.sales_agent_id as string | undefined) ?? null

  const docUrl = extractDocUrl(input.bodyText, input.bodyHtml)
  let recapText = (input.bodyText || "").trim()
  if (recapText.length > 8000) recapText = recapText.slice(0, 8000) + "\n…"

  const header = `Riepilogo call (Gemini) — ${demo.title || title}`
  const content = recapText ? `${header}\n\n${recapText}` : header

  await recordLeadActivity({
    svc,
    leadId,
    salesAgentId,
    type: "call",
    content,
    metadata: {
      source: "gemini_recap_email",
      recap_event_id: eventId,
      recap_doc_url: docUrl,
      recap_email_message_id: input.messageId,
      has_text: Boolean(recapText),
      demo_id: demo.id,
    },
  })
  return { matched: true, reason: "linked" }
}
