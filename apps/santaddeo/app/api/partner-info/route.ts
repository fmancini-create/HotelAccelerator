import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const { name, email, phone, company, structures_count, white_label, message } = body

    // Validate required fields
    if (!name || !email || !phone || !company || !structures_count || !white_label) {
      return NextResponse.json({ error: "Tutti i campi obbligatori devono essere compilati" }, { status: 400 })
    }

    const supabase = await createClient()

    // Insert into database
    const { data, error } = await supabase.from("partner_requests").insert([
      {
        name,
        email,
        phone,
        company,
        structures_count,
        white_label: white_label === "yes",
        white_label_interest: white_label,
        message: message || null,
        created_at: new Date().toISOString(),
      },
    ])

    if (error) {
      console.error("[v0] Database error:", error)
      return NextResponse.json({ error: `Errore del database: ${error.message}` }, { status: 500 })
    }

    console.log("[v0] Partner info saved successfully")

    // Send email notification via SMTP
    try {
      const { sendEmail } = await import("@/lib/email-smtp")
      await sendEmail({
        to: "info@4bid.it",
        subject: `Nuova richiesta partner da ${name} - ${company}`,
        html: `
          <h2>Nuova richiesta partner</h2>
          <p><strong>Nome:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Telefono:</strong> ${phone}</p>
          <p><strong>Azienda:</strong> ${company}</p>
          <p><strong>Numero strutture:</strong> ${structures_count}</p>
          <p><strong>White Label:</strong> ${white_label}</p>
          ${message ? `<p><strong>Messaggio:</strong> ${message}</p>` : ""}
        `,
        replyTo: email,
      })
    } catch (emailError) {
      console.error("[v0] Email error:", emailError)
    }

    return NextResponse.json({ success: true, message: "Richiesta inviata con successo" }, { status: 200 })
  } catch (error) {
    console.error("[v0] Partner info API error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore del server" }, { status: 500 })
  }
}
