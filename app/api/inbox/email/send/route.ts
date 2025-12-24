import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import * as nodemailer from "nodemailer"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { conversation_id, content, property_id } = body

    if (!conversation_id || !content || !property_id) {
      return NextResponse.json({ error: "conversation_id, content e property_id sono obbligatori" }, { status: 400 })
    }

    // 1. Recupera la conversazione con il contatto
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select(`
        *,
        contact:contacts(*)
      `)
      .eq("id", conversation_id)
      .eq("property_id", property_id)
      .single()

    if (convError || !conversation) {
      return NextResponse.json({ error: "Conversazione non trovata" }, { status: 404 })
    }

    // 2. Recupera il canale email associato (o il default)
    let emailChannel

    if (conversation.channel_id) {
      const { data } = await supabase
        .from("email_channels")
        .select("*")
        .eq("id", conversation.channel_id)
        .eq("property_id", property_id)
        .single()
      emailChannel = data
    }

    // Se non c'è un canale associato, usa il default
    if (!emailChannel) {
      const { data } = await supabase
        .from("email_channels")
        .select("*")
        .eq("property_id", property_id)
        .eq("is_active", true)
        .eq("is_default", true)
        .single()
      emailChannel = data
    }

    // Se ancora non c'è, prendi il primo attivo
    if (!emailChannel) {
      const { data } = await supabase
        .from("email_channels")
        .select("*")
        .eq("property_id", property_id)
        .eq("is_active", true)
        .limit(1)
        .single()
      emailChannel = data
    }

    if (!emailChannel) {
      return NextResponse.json({ error: "Nessun canale email configurato per questa struttura" }, { status: 400 })
    }

    // 3. Verifica configurazione SMTP
    if (!emailChannel.smtp_host || !emailChannel.smtp_user || !emailChannel.smtp_password) {
      return NextResponse.json({ error: "Configurazione SMTP incompleta per il canale email" }, { status: 400 })
    }

    // 4. Recupera l'email del destinatario
    const recipientEmail = conversation.contact?.email
    if (!recipientEmail) {
      return NextResponse.json({ error: "Email del destinatario non trovata" }, { status: 400 })
    }

    // 5. Prepara subject (Re: originale se presente)
    const originalSubject = conversation.subject || "Messaggio da " + (emailChannel.display_name || emailChannel.name)
    const subject = originalSubject.startsWith("Re:") ? originalSubject : `Re: ${originalSubject}`

    // 6. Configura transporter SMTP
    const transporter = nodemailer.createTransport({
      host: emailChannel.smtp_host,
      port: emailChannel.smtp_port || 587,
      secure: emailChannel.smtp_port === 465,
      auth: {
        user: emailChannel.smtp_user,
        pass: emailChannel.smtp_password,
      },
    })

    // 7. Prepara e invia email
    const fromName = emailChannel.display_name || emailChannel.name || "Hotel"
    const fromEmail = emailChannel.email_address

    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      replyTo: fromEmail,
      to: recipientEmail,
      subject: subject,
      text: content,
      html: `<div style="font-family: Arial, sans-serif; line-height: 1.6;">${content.replace(/\n/g, "<br>")}</div>`,
    }

    // Invia email
    await transporter.sendMail(mailOptions)

    // 8. Salva il messaggio nel database
    const { data: message, error: msgError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversation_id,
        property_id: property_id,
        content: content,
        sender_type: "agent",
        content_type: "text",
        metadata: {
          email_sent: true,
          sent_to: recipientEmail,
          sent_from: fromEmail,
          subject: subject,
          sent_at: new Date().toISOString(),
        },
      })
      .select()
      .single()

    if (msgError) {
      console.error("Error saving message:", msgError)
      // L'email è stata inviata ma non salvata - logga ma non fallire
    }

    // 9. Aggiorna last_message_at della conversazione
    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        status: "open",
      })
      .eq("id", conversation_id)

    return NextResponse.json({
      success: true,
      message: message || { id: "temp", content },
      sent_to: recipientEmail,
    })
  } catch (error: unknown) {
    console.error("Error sending email:", error)

    // Gestisci errori SMTP specifici
    const errorMessage = error instanceof Error ? error.message : "Errore sconosciuto"

    if (errorMessage.includes("ECONNREFUSED")) {
      return NextResponse.json(
        { error: "Impossibile connettersi al server SMTP. Verifica le impostazioni." },
        { status: 500 },
      )
    }

    if (errorMessage.includes("EAUTH") || errorMessage.includes("authentication")) {
      return NextResponse.json({ error: "Autenticazione SMTP fallita. Verifica username e password." }, { status: 500 })
    }

    return NextResponse.json({ error: `Errore invio email: ${errorMessage}` }, { status: 500 })
  }
}
