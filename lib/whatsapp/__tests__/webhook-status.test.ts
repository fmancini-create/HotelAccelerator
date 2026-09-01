import { describe, expect, it } from "vitest"
import { parseWhatsAppWebhook } from "@/lib/whatsapp/channels"

describe("WhatsApp delivery status webhook", () => {
  it("keeps the source phone number and Meta failure details tenant-routable", () => {
    const parsed = parseWhatsAppWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-1",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "738863805971113" },
                statuses: [
                  {
                    id: "wamid.template",
                    status: "failed",
                    timestamp: "1788296882",
                    recipient_id: "393331234567",
                    errors: [
                      {
                        code: 131049,
                        title: "Message not delivered",
                        message: "Message not delivered",
                        error_data: { details: "Meta delivery policy rejected the message" },
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    })

    expect(parsed.messages).toHaveLength(0)
    expect(parsed.echoes).toHaveLength(0)
    expect(parsed.statuses).toEqual([
      {
        phoneNumberId: "738863805971113",
        id: "wamid.template",
        status: "failed",
        recipientId: "393331234567",
        timestamp: new Date(1788296882 * 1000),
        errors: [
          {
            code: 131049,
            title: "Message not delivered",
            message: "Message not delivered",
            details: "Meta delivery policy rejected the message",
          },
        ],
      },
    ])
  })

  it("normalizes successful delivery statuses without inventing errors", () => {
    const parsed = parseWhatsAppWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "123456" },
                statuses: [
                  {
                    id: "wamid.ok",
                    status: "DELIVERED",
                    timestamp: "1788296882",
                  },
                ],
              },
            },
          ],
        },
      ],
    })

    expect(parsed.statuses[0]).toMatchObject({
      phoneNumberId: "123456",
      id: "wamid.ok",
      status: "delivered",
      errors: [],
    })
  })
})
