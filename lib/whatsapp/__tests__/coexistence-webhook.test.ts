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

  it("keeps WhatsApp image media ids renderable through the authenticated proxy", () => {
    const parsed = parseWhatsAppWebhook({
      object: "whatsapp_business_account",
      entry: [{ changes: [{
        field: "messages",
        value: {
          metadata: { phone_number_id: "pn_tenant_a" },
          contacts: [{ wa_id: "393331112233", profile: { name: "Cliente A" } }],
          messages: [{
            id: "wamid.image.1",
            from: "393331112233",
            timestamp: "1787738403",
            type: "image",
            image: { id: "media_123", mime_type: "image/jpeg", caption: "Camera <vista> & piscina" },
          }],
        },
      }] }],
    })

    expect(parsed.messages).toHaveLength(1)
    expect(parsed.messages[0].messageType).toBe("image")
    expect(parsed.messages[0].body).toContain("/api/channels/whatsapp/media/pn_tenant_a/media_123")
    expect(parsed.messages[0].body).toContain("<img")
    expect(parsed.messages[0].body).toContain("Camera &lt;vista&gt; &amp; piscina")
    expect(parsed.messages[0].body).not.toContain("Camera <vista>")
  })
})
