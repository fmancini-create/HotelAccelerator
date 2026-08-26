import { describe, expect, it } from "vitest"
import { parseWhatsAppWebhook } from "../channels"

describe("WhatsApp Business App coexistence webhooks", () => {
  it("separates an app-originated echo from customer inbound messages", () => {
    const parsed = parseWhatsAppWebhook({
      object: "whatsapp_business_account",
      entry: [{ changes: [{
        field: "smb_message_echoes",
        value: { metadata: { phone_number_id: "pn_4bid" }, message_echoes: [{
          id: "wamid.echo.1", to: "393331112233", timestamp: "1787738400",
          type: "text", text: { body: "Messaggio scritto dal telefono" },
        }] },
      }] }],
    })

    expect(parsed.messages).toEqual([])
    expect(parsed.echoes).toHaveLength(1)
    expect(parsed.echoes[0]).toMatchObject({
      phoneNumberId: "pn_4bid", externalId: "wamid.echo.1",
      toPhone: "393331112233", body: "Messaggio scritto dal telefono", messageType: "text",
    })
  })

  it("pins every batched event to its originating business number", () => {
    const parsed = parseWhatsAppWebhook({
      object: "whatsapp_business_account",
      entry: [{ changes: [
        { field: "messages", value: {
          metadata: { phone_number_id: "pn_tenant_a" },
          contacts: [{ wa_id: "393331112233", profile: { name: "Cliente A" } }],
          messages: [{ id: "wamid.inbound.a", from: "393331112233", timestamp: "1787738401", type: "text", text: { body: "Buongiorno" } }],
        } },
        { field: "smb_message_echoes", value: {
          metadata: { phone_number_id: "pn_tenant_b" },
          message_echoes: [{ id: "wamid.echo.b", to: "393339998888", timestamp: "1787738402", type: "text", text: { body: "Risposta dall’app B" } }],
        } },
      ] }],
    })

    expect(parsed.messages[0]).toMatchObject({
      phoneNumberId: "pn_tenant_a", externalId: "wamid.inbound.a", fromPhone: "393331112233", fromName: "Cliente A", body: "Buongiorno",
    })
    expect(parsed.echoes[0]).toMatchObject({
      phoneNumberId: "pn_tenant_b", externalId: "wamid.echo.b", toPhone: "393339998888",
    })
  })
})
