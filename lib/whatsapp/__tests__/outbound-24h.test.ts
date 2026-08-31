import { afterEach, describe, expect, it, vi } from "vitest"
import { sendWhatsAppTemplate } from "@/lib/whatsapp/client"
import { parseWhatsAppReopenAction } from "@/lib/whatsapp/pending"
import type { InboundWhatsAppMessage } from "@/lib/whatsapp/processor"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("WhatsApp 24h outbound", () => {
  it("sends the approved template with tenant name and opaque quick-reply payloads", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ messages: [{ id: "wamid.template" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await sendWhatsAppTemplate(
      { phone_number_id: "123456", graph_version: "v26.0" },
      { access_token: "secret" },
      "+39 333 123 4567",
      {
        name: "hotelaccelerator_nuova_comunicazione",
        language: "it",
        bodyParameters: ["Villa Demo"],
        quickReplies: [
          { index: 0, payload: "HA_WA_OPEN:11111111-1111-4111-8111-111111111111" },
          { index: 1, payload: "HA_WA_DECLINE:11111111-1111-4111-8111-111111111111" },
        ],
      },
    )

    expect(result).toEqual({ success: true, externalMessageId: "wamid.template" })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://graph.facebook.com/v26.0/123456/messages")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret")

    const body = JSON.parse(String(init.body))
    expect(body.to).toBe("393331234567")
    expect(body.type).toBe("template")
    expect(body.template.name).toBe("hotelaccelerator_nuova_comunicazione")
    expect(body.template.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "Villa Demo" }] },
      {
        type: "button",
        sub_type: "quick_reply",
        index: "0",
        parameters: [{ type: "payload", payload: "HA_WA_OPEN:11111111-1111-4111-8111-111111111111" }],
      },
      {
        type: "button",
        sub_type: "quick_reply",
        index: "1",
        parameters: [{ type: "payload", payload: "HA_WA_DECLINE:11111111-1111-4111-8111-111111111111" }],
      },
    ])
  })

  it("recognizes reopen quick replies by payload, not by the visible button label", () => {
    const base: InboundWhatsAppMessage = {
      phoneNumberId: "123456",
      externalId: "wamid.inbound",
      fromPhone: "393331234567",
      body: "Qualunque testo localizzato",
      messageType: "button",
      timestamp: new Date("2026-08-31T12:00:00Z"),
      raw: {
        type: "button",
        button: {
          text: "Apri comunicazione",
          payload: "HA_WA_OPEN:11111111-1111-4111-8111-111111111111",
        },
      },
    }

    expect(parseWhatsAppReopenAction(base)).toEqual({
      action: "accept",
      pendingId: "11111111-1111-4111-8111-111111111111",
    })

    expect(
      parseWhatsAppReopenAction({
        ...base,
        raw: { button: { text: "Non ora", payload: "HA_WA_DECLINE:11111111-1111-4111-8111-111111111111" } },
      }),
    ).toEqual({ action: "decline", pendingId: "11111111-1111-4111-8111-111111111111" })
  })
})
