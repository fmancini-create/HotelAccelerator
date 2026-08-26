import { describe, expect, it } from "vitest"
import { parseWhatsAppWebhook } from "../channels"

describe("WhatsApp Business App coexistence webhooks", () => {
  it("separates an app-originated echo from customer inbound messages", () => {
    const parsed = parseWhatsAppWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "smb_message_echoes",
              value: {
                metadata: { phone_number_id: "pn_4bid" },
                message_echoes: [
                  {
                    id: "wamid.echo.1",
                    from: "390558290741",
                    to: "393331112233",
                    timestamp: "1787738400",
                    type: "text",
                    text: { body: "Messaggio scritto dal telefono" },
                  },
                ],
              },
            },
          ],
        },
      ],
    })

    expect(parsed.phoneNumberId).toBe("pn_4bid")
    expect(parsed.messages).toEqual([])
    expect(parsed.echoes).toHaveLength(1)
    expect(parsed.echoes[0]).toMatchObject({
      externalId: "wamid.echo.1",
      toPhone: "393331112233",
      body: "Messaggio scritto dal telefono",
      messageType: "text",
    })
  })

  it("continues to parse standard customer messages normally", () => {
    const parsed = parseWhatsAppWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "pn_4bid" },
                contacts: [{ wa_id: "393331112233", profile: { name: "Cliente" } }],
                messages: [
                  {
                    id: "wamid.inbound.1",
                    from: "393331112233",
                    timestamp: "1787738401",
                    type: "text",
                    text: { body: "Buongiorno" },
                  },
                ],
              },
            },
          ],
        },
      ],
    })

    expect(parsed.echoes).toEqual([])
    expect(parsed.messages[0]).toMatchObject({
      externalId: "wamid.inbound.1",
      fromPhone: "393331112233",
      fromName: "Cliente",
      body: "Buongiorno",
    })
  })
})
