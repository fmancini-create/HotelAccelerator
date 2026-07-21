import { ImapFlow } from "imapflow"
import { simpleParser } from "mailparser"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getSalesInboxConfigs, type SalesInboxConfig } from "@/lib/sales/inbox-config"
import { recordInboundMessage, recordUnmatchedEmail, createLeadForAgent } from "@/lib/sales/lead-messages"
import { isGeminiRecapEmail, linkGeminiRecapEmail } from "@/lib/sales/call-recaps"
import { withTimeout } from "@/lib/supabase/error-utils"

/**
 * Legge le caselle IMAP (clienti@4bid.it + noreply@santaddeo.com), individua le
 * RISPOSTE dei clienti alle email dei venditori e le registra in
 * sales_lead_messages.
 *
 * Abbinamento al lead (in ordine di affidabilita'):
 *  1. header In-Reply-To / References → match su sales_leads.last_outbound_message_id
 *     o su sales_lead_messages.message_id (outbound).
 *  2. alias destinatario + mittente: l'alias su cui ha scritto il cliente
 *     (To/Cc) identifica il venditore (sales_agents.sender_email); tra i lead
 *     di QUEL venditore si cerca quello con l'email del mittente.
 *  3. fallback: indirizzo del mittente (from) → lead con quella email che ha
 *     gia' ricevuto un invio (email_sent_at non nullo). Se piu' lead, prende
 *     il piu' recente.
 *
 * Idempotente: tiene traccia dell'UID IMAP e del message_id per non duplicare.
 * Marca come letti (\Seen) i messaggi processati per non rileggerli ogni volta.
 */

interface SyncResult {
  enabled: boolean
  processed: number
  matched: number
  unmatched: number
  errors: number
  /** Dettaglio diagnostico dell'eventuale errore di connessione. */
  detail?: string
}

/** Normalizza un Message-ID rimuovendo eventuali < > e spazi. */
function normalizeId(id?: string | null): string | null {
  if (!id) return null
  const m = id.trim().replace(/^<|>$/g, "").trim()
  return m || null
}

  /**
   * Estrae tutti i Message-ID da un header References/In-Reply-To.
   * mailparser puo' restituire `references` come stringa O come array di
   * stringhe (mail con piu' header References, tipico dei thread). Gestiamo
   * entrambi: senza questo, su un array `value.match` lanciava
   * "e.match is not a function" e l'email veniva scartata come errore.
   */
  function extractIds(value?: string | string[] | null): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.flatMap((v) => extractIds(v))
  }
  if (typeof value !== "string") return []
  const matches = value.match(/<[^>]+>/g)
  if (matches) return matches.map((m) => m.replace(/^<|>$/g, "").trim()).filter(Boolean)
  const single = normalizeId(value)
  return single ? [single] : []
  }

  /** Normalizza il valore References per la persistenza (array -> stringa). */
  function referencesToString(value?: string | string[] | null): string | null {
  if (!value) return null
  return Array.isArray(value) ? value.join(" ") || null : value
  }

/**
 * Raccoglie TUTTI gli indirizzi destinatari (To + Cc) di una mail, in
 * minuscolo. Serve per risolvere il venditore dall'alias su cui ha scritto il
 * cliente (es. f.errico@santaddeo.com), anche quando l'alias non e' il primo
 * destinatario. mailparser puo' restituire un AddressObject singolo o un array.
 */
function collectRecipients(
  ...fields: Array<{ value?: Array<{ address?: string }> } | Array<{ value?: Array<{ address?: string }> }> | undefined>
): string[] {
  const out = new Set<string>()
  for (const field of fields) {
    if (!field) continue
    const objs = Array.isArray(field) ? field : [field]
    for (const obj of objs) {
      for (const v of obj?.value ?? []) {
        const a = v?.address?.toLowerCase().trim()
        if (a) out.add(a)
      }
    }
  }
  return [...out]
}

export async function syncSalesInboxReplies(options?: { maxMessages?: number }): Promise<SyncResult> {
  const configs = getSalesInboxConfigs()
  const enabledConfigs = configs.filter((c) => c.enabled)

  if (enabledConfigs.length === 0) {
    console.warn("[sales-inbox] Nessuna casella IMAP configurata (manca SALES_INBOX_IMAP_PASSWORD): skip")
    return { enabled: false, processed: 0, matched: 0, unmatched: 0, errors: 0 }
  }

  // Scandisce ogni casella in modo indipendente e aggrega i contatori. Un
  // errore su una casella (es. auth) non blocca le altre.
  const aggregate: SyncResult = { enabled: true, processed: 0, matched: 0, unmatched: 0, errors: 0 }
  const details: string[] = []

  // Budget wall-clock GLOBALE condiviso fra tutte le caselle. La function ha
  // maxDuration=60s: con piu' caselle processate IN SEQUENZA un budget
  // per-casella (es. 45s ciascuna) puo' sommarsi e superare i 60s -> Vercel
  // uccide la function (504 FUNCTION_INVOCATION_TIMEOUT). Con una deadline
  // unica condivisa il totale resta sotto i 60s; i messaggi non processati
  // restano \Unseen e vengono ripresi al run successivo (idempotente).
  // 40s (non 50): il budget ferma solo i LOOP, ma connect (15s) + getMailboxLock
  // (12s) + search (15s) della casella in corso NON sono nel loop e vengono dopo
  // il check. Con maxDuration=60s servono ~20s di margine perche' setup+cleanup
  // (logout bounded 3s) della casella corrente non facciano sforare i 60s (504).
  const deadline = Date.now() + 40_000

  for (const cfg of enabledConfigs) {
    if (Date.now() > deadline) {
      console.warn(`[sales-inbox] budget globale esaurito: salto la casella ${cfg.label} (ripresa al prossimo run)`)
      details.push(`${cfg.label}: skipped_global_budget`)
      continue
    }
    const r = await syncSingleInbox(cfg, { ...options, deadline })
    aggregate.processed += r.processed
    aggregate.matched += r.matched
    aggregate.unmatched += r.unmatched
    aggregate.errors += r.errors
    if (r.detail) details.push(`${cfg.label}: ${r.detail}`)
  }

  if (details.length > 0) aggregate.detail = details.join(" | ")
  console.log("[sales-inbox] sync done (tutte le caselle):", JSON.stringify(aggregate))
  return aggregate
}

/**
 * Scandisce UNA singola casella IMAP. Stessa logica di matching per tutte le
 * caselle: gli header di threading e l'indirizzo mittente sono indipendenti
 * dalla casella che riceve la copia.
 */
async function syncSingleInbox(
  cfg: SalesInboxConfig,
  options?: { maxMessages?: number; deadline?: number },
): Promise<SyncResult> {
  const result: SyncResult = { enabled: cfg.enabled, processed: 0, matched: 0, unmatched: 0, errors: 0 }
  if (!cfg.enabled) return result

  const maxMessages = options?.maxMessages ?? 50
  const svc = await createServiceRoleClient()

  // IMPORTANTE: ImapFlow estende EventEmitter. Se il socket va in timeout (o
  // cade) DOPO la connessione, il client emette un evento 'error'. Senza un
  // listener, Node trasforma quell'evento in un'eccezione NON gestita
  // ("Uncaught Exception: Socket timeout") che finisce nei log come fatal anche
  // se la richiesta ha gia' risposto. Registrare un listener lo declassa a log
  // gestito: la sync corrente verra' comunque interrotta dal flusso try/finally.
  const onClientError = (err: unknown) => {
    console.warn("[sales-inbox] IMAP client error (gestito):", err instanceof Error ? err.message : String(err))
  }

  const makeClient = () =>
    new ImapFlow({
      host: cfg.host,
      port: cfg.port,
      secure: true,
      auth: { user: cfg.user, pass: cfg.pass },
      logger: false,
      // Evita che il cron resti appeso se la rete/host non risponde.
      // socketTimeout < maxDuration della function (60s): se il socket si appende
      // durante una query DB lenta, imapflow lo chiude e i comandi successivi
      // falliscono con NoConnection (gestito con break) invece di far arrivare la
      // function al kill dei 60s ("Task timed out").
      // Cap per-tentativo abbassati (fix 18/07/2026) per lasciare spazio a UN
      // retry entro il budget: una connect sana verso Gmail chiude in 2-3s.
      connectionTimeout: 12000,
      greetingTimeout: 8000,
      socketTimeout: 30000,
    })

  // ACQUISIZIONE SESSIONE (connect + lock INBOX) CON RETRY.
  //
  // fix 18/07/2026 (connect): in prod i log mostravano UNA casella per run che
  // andava in timeout esatto a 20s con authenticationFailed=null (NON auth)
  // mentre l'altra connetteva in 2-3s, a rotazione -> stallo TRANSITORIO
  // dell'handshake TCP/TLS verso imap.gmail.com; senza retry quella casella
  // veniva saltata per l'intero run.
  // fix 20/07/2026 (lock): stessa classe di stallo osservata DOPO una connect
  // riuscita, su getMailboxLock ("mailbox_lock_timeout"). getMailboxLock fa un
  // SELECT INBOX sul server e puo' appendersi come la connect. Quindi ora
  // connect e lock sono acquisiti INSIEME nello stesso tentativo retriabile:
  // se uno dei due si impianta, chiudiamo il client e ritentiamo da zero con
  // client FRESCO.
  //
  // HARD-GUARD withTimeout: i timer interni di imapflow non coprono ogni stato
  // del socket (TLS half-open -> connect appesa oltre i suoi timer, gia' visto
  // causare 504). Il retry parte SOLO se non e' auth-failure e se resta budget
  // (deadline globale condivisa) per non far sforare maxDuration=60s.
  let client!: ImapFlow
  let lock: Awaited<ReturnType<typeof client.getMailboxLock>> | null = null
  const CONNECT_CAP_MS = 12_000
  const LOCK_CAP_MS = 12_000
  const maxAttempts = 2
  let acquireErr: unknown = null
  // Stage in cui e' fallito l'ULTIMO tentativo: distingue il detail finale
  // (connect_failed conta come errore; mailbox_lock_timeout resta graceful).
  let failStage: "connect" | "lock" = "connect"
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidate = makeClient()
    candidate.on("error", onClientError)
    let stage: "connect" | "lock" = "connect"
    try {
      await withTimeout(candidate.connect(), CONNECT_CAP_MS, `sales-inbox connect ${cfg.label}`)
      stage = "lock"
      const acquiredLock = await withTimeout(
        candidate.getMailboxLock("INBOX"),
        LOCK_CAP_MS,
        `sales-inbox lock ${cfg.label}`,
      )
      client = candidate
      lock = acquiredLock
      acquireErr = null
      break
    } catch (e) {
      acquireErr = e
      failStage = stage
      // Chiudi il socket half-open del tentativo fallito (close() e' sincrono).
      try {
        candidate.close()
      } catch {
        // ignore
      }
      const err = e as { message?: string; authenticationFailed?: boolean; code?: string }
      // Auth fallita: NON ha senso ritentare (credenziali/app-password errate).
      const isAuthFailure = err?.authenticationFailed === true
      // Ritenta solo se: non e' auth, ci sono tentativi residui e resta budget
      // per completare connect+lock di un altro tentativo entro la deadline.
      const budgetOk = !options?.deadline || Date.now() + CONNECT_CAP_MS + LOCK_CAP_MS + 1_500 < options.deadline
      const canRetry = !isAuthFailure && attempt < maxAttempts && budgetOk
      console.warn(
        `[sales-inbox] acquisizione ${stage} tentativo ${attempt}/${maxAttempts} fallita (${cfg.label}): ${
          err?.message ?? String(e)
        }${canRetry ? " -> retry" : ""}`,
      )
      if (!canRetry) break
      await new Promise<void>((r) => setTimeout(r, 1_000))
    }
  }

  // imapflow lancia un errore generico ("Command failed"): i dettagli utili
  // (auth fallita, testo della risposta del server, codice) stanno nelle
  // proprieta' dell'oggetto errore. Li logghiamo per diagnosticare in prod.
  if (acquireErr || !lock) {
    const e = acquireErr
    const err = e as {
      message?: string
      responseText?: string
      authenticationFailed?: boolean
      code?: string
      response?: string
    }
    if (failStage === "lock") {
      // Connect riuscita ma lock non ottenuto: come prima, casella trattata
      // come non disponibile e ripresa al prossimo run (NON conta come errore).
      console.warn(
        `[sales-inbox] getMailboxLock non riuscito (${cfg.label}) dopo ${maxAttempts} tentativi: ${
          err?.message ?? String(e)
        }`,
      )
      result.detail = "mailbox_lock_timeout"
    } else {
      console.error(
        "[sales-inbox] IMAP connect failed:",
        JSON.stringify({
          host: cfg.host,
          port: cfg.port,
          user: cfg.user,
          passLen: cfg.pass?.length ?? 0,
          attempts: maxAttempts,
          message: err?.message ?? String(e),
          authenticationFailed: err?.authenticationFailed ?? null,
          code: err?.code ?? null,
          responseText: err?.responseText ?? null,
          response: err?.response ?? null,
        }),
      )
      result.errors++
      result.detail = `connect_failed: ${err?.responseText || err?.message || String(e)}${
        err?.authenticationFailed ? " (auth failed)" : ""
      }`
    }
    return result
  }
  try {
    // Cerca solo i messaggi NON letti: le risposte nuove. I messaggi gia'
    // processati vengono marcati \Seen, quindi non riappaiono.
    //
    // FINESTRA TEMPORALE (fix backlog infinito): la casella umana
    // (clienti@4bid.it) lascia \Unseen le mail non-commerciali (spam/calendario)
    // per non "rubarle" all'operatore. Senza limite quel backlog cresce
    // all'infinito e viene RISCANSIONATO a ogni run (ogni 5 min): stessi
    // messaggi ri-scaricati e ri-parsati, budget bruciato e rischio timeout 60s.
    // Filtriamo agli ultimi 14 giorni: le risposte reali entrano in minuti,
    // quindi la finestra e' ampiamente sicura (copre anche i recap Gemini in
    // attesa del lead della demo).
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    const uids = await withTimeout(
      client.search({ seen: false, since }, { uid: true }),
      15_000,
      "sales-inbox search",
    )
    const toProcess = (uids || []).slice(-maxMessages)

    // Budget wall-clock: la function ha maxDuration=60s. Quando Supabase e'
    // lento le query per-messaggio si accumulano e Vercel uccide la function
    // (504), potenzialmente a META' di una scrittura. Ci fermiamo in modo
    // PULITO, tra un messaggio e l'altro: i non processati restano \Unseen e
    // verranno ripresi al run successivo (idempotente). Usiamo la deadline
    // GLOBALE passata dal chiamante (condivisa fra tutte le caselle) cosi' il
    // totale resta sotto i 60s; in mancanza, fallback locale di 45s.
    const deadline = options?.deadline ?? Date.now() + 40_000

    for (const uid of toProcess) {
      if (Date.now() > deadline) {
        console.warn(
          `[sales-inbox] budget tempo esaurito (${cfg.label}): mi fermo dopo ${result.processed} msg, ${
            toProcess.length - result.processed
          } rimandati al prossimo run`,
        )
        result.detail = "time_budget_reached"
        break
      }
      // Ogni messaggio ha un limite di tempo RIGIDO: durante la lentezza DB
      // notturna una singola query Supabase (o il download IMAP) puo' appendersi
      // e portare l'intera function al kill dei 60s. Con withTimeout il singolo
      // messaggio fallisce dopo 12s, resta \Unseen (idempotente) e viene ripreso
      // al run successivo.
      const processUid = async () => {
        const msg = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true })
        if (!msg || !msg.source) return
        result.processed++

        const parsed = await simpleParser(msg.source as Buffer)
        const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase() || null
        const toEmail =
          (Array.isArray(parsed.to) ? parsed.to[0]?.value?.[0]?.address : parsed.to?.value?.[0]?.address) || null
        // Tutti i destinatari (To + Cc): usati per risolvere il venditore
        // dall'alias su cui il cliente ha scritto (es. f.errico@santaddeo.com).
        const recipients = collectRecipients(parsed.to, parsed.cc)
        const subject = parsed.subject || null
        const messageId = normalizeId(parsed.messageId)
        const inReplyTo = normalizeId(parsed.inReplyTo)
        const refIds = [...extractIds(parsed.references as string | string[] | undefined), ...(inReplyTo ? [inReplyTo] : [])]
        const bodyText = parsed.text || null
        const bodyHtml = typeof parsed.html === "string" ? parsed.html : null
        const receivedAt = (parsed.date || new Date()).toISOString()

        // --- Scarta le copie ARCHIVIO (BCC) delle nostre stesse email --------
        // Ogni email del venditore manda una copia BCC a questa casella per
        // archivio. Quella copia ha lo STESSO Message-ID dell'outbound gia'
        // salvato: non e' una risposta del cliente. La marchiamo \Seen e la
        // saltiamo, altrimenti resterebbe non letta e riprocessata a ogni run.
        if (messageId) {
          const { data: ownOutbound } = await svc
            .from("sales_lead_messages")
            .select("id")
            .eq("direction", "outbound")
            .eq("message_id", messageId)
            .limit(1)
            .maybeSingle()
          if (ownOutbound) {
            await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true })
            return
          }
        }

        // --- Riepilogo call di Gemini ----------------------------------------
        // Le note Gemini arrivano qui (clienti@4bid.it) dall'organizzatore Meet
        // con oggetto Note: "<titolo demo>". Non sono risposte cliente: le
        // colleghiamo alla cronologia del lead via titolo+data della demo.
        if (isGeminiRecapEmail({ subject, fromEmail })) {
          const recap = await linkGeminiRecapEmail({
            subject,
            bodyText,
            bodyHtml,
            receivedAt,
            messageId,
          })
          if (recap.matched) {
            // Abbinata (o gia' collegata): marca letta e non riprocessare.
            await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true })
            result.matched++
          } else {
            // Nessuna demo certa: NON inventiamo l'abbinamento. Lasciamo la mail
            // NON letta (verra' ritentata quando la demo avra' un lead).
            result.unmatched++
          }
          return
        }

        // --- Match del lead --------------------------------------------------
        let leadId: string | null = null
        let salesAgentId: string | null = null

        // 1) Per header di threading.
        if (refIds.length > 0) {
          const { data: leadByRef } = await svc
            .from("sales_leads")
            .select("id, sales_agent_id")
            .in("last_outbound_message_id", refIds)
            .order("email_sent_at", { ascending: false })
            .limit(1)
            .maybeSingle()
          if (leadByRef) {
            leadId = leadByRef.id
            salesAgentId = leadByRef.sales_agent_id
          }
          // 1b) Match su un qualsiasi messaggio outbound salvato.
          if (!leadId) {
            const { data: msgByRef } = await svc
              .from("sales_lead_messages")
              .select("lead_id, sales_agent_id")
              .eq("direction", "outbound")
              .in("message_id", refIds)
              .limit(1)
              .maybeSingle()
            if (msgByRef) {
              leadId = msgByRef.lead_id
              salesAgentId = msgByRef.sales_agent_id
            }
          }
        }

        // 2) Per ALIAS destinatario + mittente: se il cliente ha scritto a un
        //    alias venditore (es. f.errico@santaddeo.com -> sales_agents
        //    .sender_email), risolviamo PRIMA il venditore e poi il SUO lead con
        //    l'email del mittente. Piu' preciso del fallback solo-mittente
        //    quando la stessa email cliente esiste su piu' venditori.
        if (!leadId && fromEmail && recipients.length > 0) {
          const { data: agentByAlias } = await svc
            .from("sales_agents")
            .select("id")
            .in("sender_email", recipients)
            .limit(1)
            .maybeSingle()
          if (agentByAlias) {
            const { data: leadForAgent } = await svc
              .from("sales_leads")
              .select("id, sales_agent_id")
              .eq("sales_agent_id", agentByAlias.id)
              .ilike("email", fromEmail)
              .order("email_sent_at", { ascending: false, nullsFirst: false })
              .limit(1)
              .maybeSingle()
            if (leadForAgent) {
              leadId = leadForAgent.id
              salesAgentId = leadForAgent.sales_agent_id
            }
          }
        }

        // 3) Fallback: indirizzo mittente.
        if (!leadId && fromEmail) {
          const { data: leadByEmail } = await svc
            .from("sales_leads")
            .select("id, sales_agent_id")
            .ilike("email", fromEmail)
            .not("email_sent_at", "is", null)
            .order("email_sent_at", { ascending: false })
            .limit(1)
            .maybeSingle()
          if (leadByEmail) {
            leadId = leadByEmail.id
            salesAgentId = leadByEmail.sales_agent_id
          }
        }

        if (!leadId) {
          // Nessun lead abbinato dagli step precedenti. Distinguiamo i casi in
          // base al DESTINATARIO (alias venditore noto) e alla casella.
          let suggestedAgentId: string | null = null
          if (recipients.length > 0) {
            const { data: agentByAlias } = await svc
              .from("sales_agents")
              .select("id")
              .in("sender_email", recipients)
              .limit(1)
              .maybeSingle()
            suggestedAgentId = agentByAlias?.id ?? null
          }

          if (suggestedAgentId) {
            // La mail e' arrivata su un ALIAS venditore noto ma il mittente non
            // e' ancora un lead: creiamo automaticamente il lead sotto quel
            // venditore e proseguiamo per attaccare la mail al suo thread (cosi'
            // la vedono sia il venditore che il super admin).
            const newLeadId = await createLeadForAgent({
              agentId: suggestedAgentId,
              fromEmail,
              fromName: parsed.from?.value?.[0]?.name || null,
              notes: "Creato da email entrante (alias venditore)",
            })
            if (newLeadId) {
              leadId = newLeadId
              salesAgentId = suggestedAgentId
              // NON facciamo continue: si prosegue al recordInboundMessage sotto.
            } else {
              // Creazione fallita: ripieghiamo sulla coda non abbinata.
              const saved = await recordUnmatchedEmail({
                messageId,
                imapUid: Number(uid),
                inboxLabel: cfg.label,
                fromEmail,
                fromName: parsed.from?.value?.[0]?.name || null,
                toEmail,
                recipients,
                subject,
                bodyHtml,
                bodyText,
                inReplyTo,
      references: referencesToString(parsed.references as string | string[] | undefined),
      suggestedAgentId,
                receivedAt,
              })
              await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true })
              if (saved) result.unmatched++
              return
            }
          } else {
            // Nessun alias venditore noto. Se e' arrivata sulla casella alias
            // venditori (noreply) la mettiamo comunque in coda per il super
            // admin; altrimenti (es. spam/calendario su clienti@4bid.it) la
            // lasciamo NON letta per non "rubarla" alla casella umana.
            const isSalesInbox = cfg.address.toLowerCase().includes("noreply@santaddeo.com")
            if (fromEmail && isSalesInbox) {
              const saved = await recordUnmatchedEmail({
                messageId,
                imapUid: Number(uid),
                inboxLabel: cfg.label,
                fromEmail,
                fromName: parsed.from?.value?.[0]?.name || null,
                toEmail,
                recipients,
                subject,
                bodyHtml,
                bodyText,
                inReplyTo,
      references: referencesToString(parsed.references as string | string[] | undefined),
      suggestedAgentId: null,
                receivedAt,
              })
              await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true })
              if (saved) result.unmatched++
            } else {
              result.unmatched++
            }
            return
          }
        }

        const inserted = await recordInboundMessage({
          leadId,
          salesAgentId,
          fromEmail,
          toEmail,
          subject,
          bodyHtml,
          bodyText,
          messageId,
          inReplyTo,
      references: referencesToString(parsed.references as string | string[] | undefined),
      imapUid: Number(uid),
          receivedAt,
        })
        if (inserted) result.matched++

        // Marca \Seen solo i messaggi abbinati a un lead.
        await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true })
      }

      try {
        await withTimeout(processUid(), 12_000, `sales-inbox uid ${uid}`)
      } catch (e) {
        const code = (e as { code?: string })?.code
        const msg = e instanceof Error ? e.message : String(e)
        // Se la connessione IMAP e' caduta (socket idle durante query DB lente),
        // OGNI comando successivo rilancia lo stesso "Connection not available":
        // inutile insistere sugli UID rimanenti (spam nei log + budget sprecato).
        // Ci fermiamo: i non processati restano \Unseen e vengono ripresi al
        // prossimo run (idempotente).
        if (code === "NoConnection" || msg.includes("Connection not available")) {
          console.warn(
            `[sales-inbox] connessione IMAP caduta (${cfg.label}): interrotto dopo ${result.processed} msg, ${
              toProcess.length - result.processed
            } rimandati al prossimo run`,
          )
          result.detail = "imap_connection_lost"
          break
        }
        result.errors++
        console.error("[sales-inbox] errore su UID", uid, msg)
      }
    }
  } finally {
    // Il socket potrebbe essere gia' caduto: proteggi entrambe le operazioni
    // per non generare una seconda eccezione in fase di cleanup.
    try {
      lock.release()
    } catch {
      /* connessione gia' chiusa */
    }
    // logout() fa un round-trip col server: su socket lento/appeso puo' attendere
    // fino a socketTimeout (30s). Se il budget e' quasi esaurito questo sfora i
    // 60s di maxDuration -> Vercel uccide la function (504). Lo limitiamo a 3s e,
    // se non chiude in tempo, forziamo close() (sincrono, chiude subito il socket).
    try {
      await withTimeout(client.logout(), 3_000, `sales-inbox logout ${cfg.label}`)
    } catch {
      try {
        client.close()
      } catch {
        /* socket gia' distrutto */
      }
    }
  }

  console.log(`[sales-inbox] sync done (${cfg.label}):`, JSON.stringify(result))
  return result
}
