import { createServiceClient } from "@/lib/supabase/server"
import { getChatWidgetByPublicKey } from "@/lib/chat-widgets/repository"
import { jsonCors, rispostaPreflight } from "@/lib/chat-widgets/cors"
import { runAutopilot } from "@/lib/ai/autopilot"

export const dynamic = "force-dynamic"

/**
 * Conversazione del widget chat, vista dal sito del cliente.
 *
 * Rotta PUBBLICA: chi la chiama e' un visitatore anonimo, senza sessione. Le
 * conseguenze, tutte volute:
 *
 * 1) L'unica credenziale e' la chiave pubblica del widget nell'URL. Da quella si
 *    ricava `property_id`: NON viene mai accettato dal corpo della richiesta.
 *    La vecchia rotta si fidava del `property_id` inviato dal browser, quindi
 *    chiunque potendo cambiare quel campo scriveva nelle conversazioni di un
 *    altro hotel.
 * 2) Si usa il service client perche' `conversations`/`messages` sono chiuse al
 *    ruolo `anon`; per questo ogni query qui filtra a mano per `property_id` e
 *    per il widget di provenienza, che e' l'unico isolamento rimasto.
 * 3) Ogni azione su una conversazione esistente ne verifica l'appartenenza a
 *    QUESTO widget: senza quel controllo un id di conversazione indovinato
 *    permetterebbe di leggere la chat di un altro ospite.
 */
export async function POST(request: Request, { params }: { params: Promise<{ publicKey: string }> }) {
  const { publicKey } = await params
  const widget = await getChatWidgetByPublicKey(publicKey)
  if (!widget) return jsonCors({ error: "Widget non trovato" }, { status: 404 })

  // Widget spento: nessuna scrittura. Il messaggio "offline" lo mostra il
  // caricatore, che lo ha gia' nella configurazione.
  if (!widget.isActive) {
    return jsonCors({ error: "Widget non attivo", code: "widget_inattivo" }, { status: 403 })
  }

  const supabase = createServiceClient()
  const propertyId = widget.propertyId

  const body = (await request.json().catch(() => ({}))) as {
    action?: string
    conversation_id?: string
    message?: string
    since?: string
    visitor?: { name?: string; email?: string; language?: string; page_url?: string; user_agent?: string }
  }

  /**
   * Conversazione appartenente a questo widget, o null.
   *
   * Il legame col widget sta in `metadata.messaging_channel_id`, la convenzione
   * gia' usata da Telegram e WhatsApp. NON si usa la colonna `conversations.
   * channel_id`: il nome inganna, ma la sua chiave esterna punta a
   * `email_channels`, quindi scrivervi l'id di un widget viene rifiutato dal
   * database.
   */
  const conversazioneDelWidget = async (conversationId: string) => {
    const { data } = await supabase
      .from("conversations")
      .select("id, metadata")
      .eq("id", conversationId)
      .eq("property_id", propertyId)
      .eq("channel", "chat")
      .maybeSingle()
    if (!data) return null
    const diQuestoWidget = (data.metadata as Record<string, unknown> | null)?.messaging_channel_id
    // Il controllo di appartenenza resta obbligatorio: senza, un id di
    // conversazione indovinato aprirebbe la chat di un altro ospite.
    return diQuestoWidget === widget.id ? data.id : null
  }

  if (body.action === "start") {
    const visitatore = body.visitor ?? {}
    let contactId: string | null = null

    // Il contatto si crea solo se il visitatore ha lasciato qualcosa di
    // utilizzabile: una rubrica piena di "Visitatore" senza recapiti non serve
    // a nessuno e sporca il CRM.
    const emailPulita = visitatore.email?.trim() || null
    if (emailPulita) {
      const { data: contact } = await supabase
        .from("contacts")
        .insert({
          property_id: propertyId,
          name: visitatore.name?.trim() || "Visitatore del sito",
          email: emailPulita,
          language: visitatore.language?.slice(0, 5) || "it",
        })
        .select("id")
        .single()
      contactId = contact?.id ?? null
    }

    const { data: conversation, error } = await supabase
      .from("conversations")
      .insert({
        property_id: propertyId,
        channel: "chat",
        contact_id: contactId,
        contact_name: visitatore.name?.trim() || null,
        contact_email: emailPulita,
        status: "open",
        subject: `Chat dal sito · ${widget.name}`,
        metadata: {
          channel: "chat",
          // Questo legame e' il punto centrale: dice DA QUALE widget arriva la
          // chat, e quindi quali basi di conoscenza deve usare l'IA e quale sito
          // vede l'operatore in inbox. Senza, le chat erano canale-cieche.
          // Il nome della chiave segue Telegram e WhatsApp, cosi' chi legge le
          // conversazioni trova lo stesso campo su tutti i canali.
          messaging_channel_id: widget.id,
          widget_name: widget.name,
          page_url: visitatore.page_url ?? null,
          user_agent: visitatore.user_agent ?? null,
        },
      })
      .select("id")
      .single()

    if (error || !conversation) {
      // La causa va registrata: un errore inghiottito costringe a indovinare.
      // Al visitatore resta un messaggio generico, perche' il dettaglio tecnico
      // non gli serve e non va esposto su un sito pubblico.
      console.error("[v0] widget chat: apertura conversazione fallita:", error?.message ?? "nessun dato")
      return jsonCors({ error: "Non è stato possibile aprire la conversazione" }, { status: 500 })
    }

    // Il benvenuto e' `system`: non e' una risposta di un operatore ne' dell'IA,
    // e non deve entrare nella storia usata per generare le risposte.
    await supabase.from("messages").insert({
      property_id: propertyId,
      conversation_id: conversation.id,
      sender_type: "system",
      content: widget.appearance.welcomeMessage,
      content_type: "text",
      status: "sent",
      stored_at: new Date().toISOString(),
      metadata: { channel: "chat", widget_id: widget.id, welcome: true },
    })

    return jsonCors({
      conversation_id: conversation.id,
      welcome_message: widget.appearance.welcomeMessage,
    })
  }

  if (body.action === "send") {
    const testo = body.message?.trim()
    if (!body.conversation_id || !testo) {
      return jsonCors({ error: "Messaggio o conversazione mancanti" }, { status: 400 })
    }
    // Limite di lunghezza: un campo di testo pubblico senza tetto e' un invito
    // a scrivere megabyte nel database.
    if (testo.length > 4000) {
      return jsonCors({ error: "Messaggio troppo lungo" }, { status: 400 })
    }

    const conversationId = await conversazioneDelWidget(body.conversation_id)
    if (!conversationId) return jsonCors({ error: "Conversazione non trovata" }, { status: 404 })

    const ora = new Date().toISOString()
    const { data: inserito, error } = await supabase
      .from("messages")
      .insert({
        property_id: propertyId,
        conversation_id: conversationId,
        sender_type: "customer",
        content: testo,
        content_type: "text",
        status: "received",
        received_at: ora,
        stored_at: ora,
        metadata: { channel: "chat", widget_id: widget.id },
      })
      .select("id, content, sender_type, stored_at")
      .single()

    if (error || !inserito) return jsonCors({ error: "Invio non riuscito" }, { status: 500 })

    await supabase
      .from("conversations")
      .update({ last_message_at: ora, updated_at: ora })
      .eq("id", conversationId)
      .eq("property_id", propertyId)

    // Risposta dell'IA con lo stesso motore di Telegram, WhatsApp ed email: la
    // modalita' (spenta / bozza / risponde da sola) la decide la base di
    // conoscenza collegata a QUESTO widget, non un interruttore locale.
    //
    // `send` qui non spedisce nulla verso un fornitore esterno: nella chat web
    // la consegna E' la riga in `messages`, che il widget legge con `messages`.
    // Va comunque passata, perche' in modalita' autopilot l'autopilot rifiuta di
    // agire senza un mezzo di consegna ("no_sender").
    let stato: "sent" | "draft" | "skipped" = "skipped"
    try {
      const esito = await runAutopilot({
        supabase,
        propertyId,
        conversationId,
        channel: "chat",
        channelId: widget.id,
        incomingText: testo,
        send: async () => {},
      })
      stato = esito.action
    } catch (e) {
      // Il messaggio del visitatore e' gia' salvato: un guasto dell'IA non deve
      // far sembrare fallito l'invio, altrimenti l'ospite riscrive tutto.
      console.log(`[v0] widget autopilot error: ${e instanceof Error ? e.message : String(e)}`)
    }

    return jsonCors({
      message: inserito,
      // Serve al widget per mostrare "sta scrivendo…" solo quando una risposta
      // automatica sta davvero arrivando.
      ai: stato === "sent" ? "risposta" : stato === "draft" ? "in_attesa_operatore" : "nessuna",
    })
  }

  if (body.action === "messages") {
    if (!body.conversation_id) return jsonCors({ error: "Conversazione mancante" }, { status: 400 })
    const conversationId = await conversazioneDelWidget(body.conversation_id)
    if (!conversationId) return jsonCors({ error: "Conversazione non trovata" }, { status: 404 })

    let query = supabase
      .from("messages")
      .select("id, content, sender_type, stored_at, status")
      .eq("conversation_id", conversationId)
      .eq("property_id", propertyId)
      // Le BOZZE non escono mai da qui: in modalita' "su richiesta" l'IA scrive
      // una risposta che l'operatore deve ancora approvare. Mostrarla al
      // visitatore vanificherebbe l'approvazione.
      .neq("status", "draft")
      // Le note interne dello staff restano interne.
      .in("sender_type", ["customer", "agent", "system"])
      .order("stored_at", { ascending: true })
      .limit(200)

    // Con `since` il widget scarica solo le novita': senza, ogni sondaggio
    // riscaricherebbe tutta la conversazione.
    if (body.since) query = query.gt("stored_at", body.since)

    const { data, error } = await query
    if (error) return jsonCors({ error: "Lettura non riuscita" }, { status: 500 })

    return jsonCors({ messages: data ?? [] })
  }

  return jsonCors({ error: "Azione non valida" }, { status: 400 })
}

export async function OPTIONS() {
  return rispostaPreflight()
}
