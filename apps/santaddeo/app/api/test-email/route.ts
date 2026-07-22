import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"

export async function POST() {
  try {
    // Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    // Check SMTP config
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
      return NextResponse.json({ 
        success: false, 
        error: "Configurazione SMTP incompleta. Verifica SMTP_HOST, SMTP_USER e SMTP_PASSWORD nelle variabili d'ambiente.",
      }, { status: 400 })
    }

    // Send test email
    const result = await sendEmail({
      to: user.email!,
      subject: "Test Email - SANTADDEO Platform",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Test Email SANTADDEO</h2>
          <p>Questa e una email di test inviata dalla piattaforma SANTADDEO.</p>
          <p>Se stai leggendo questo messaggio, la configurazione SMTP funziona correttamente.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #666; font-size: 12px;">
            Inviata da: ${process.env.SMTP_FROM || process.env.SMTP_USER}<br/>
            SMTP: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 465}<br/>
            Data: ${new Date().toLocaleString("it-IT")}
          </p>
        </div>
      `,
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: `Email di test inviata a ${user.email}`,
      messageId: result.messageId,
    })
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : "Errore sconosciuto"
    console.error("[v0] Test email error:", errMsg)
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 })
  }
}
