import { afterEach, describe, expect, it, vi } from "vitest"
import { sendWhatsAppTemplate } from "@/lib/whatsapp/client"
import { parseWhatsAppReopenAction } from "@/lib/whatsapp/pending"
import {
  ensureWhatsAppReopenTemplate,
  WHATSAPP_REOPEN_TEMPLATE_BODY,
  WHATSAPP_REOPEN_TEMPLATE_NAME,
} from "@/lib/whatsapp/template-provisioning"
import type { InboundWhatsAppMessage } from "@/lib/whatsapp/processor"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("WhatsApp 24h outbound", () => {
  it("sends the approved template with tenant name and opaque quick-reply payloads", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, _init) =>
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

    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe("https://graph.facebook.com/v26.0/123456/messages")
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer secret")

    const requestBody = JSON.parse(String(init?.body))
    expect(requestBody.to).toBe("393331234567")
    expect(requestBody.type).toBe("template")
    expect(requestBody.template.name).toBe("hotelaccelerator_nuova_comunicazione")
    expect(requestBody.template.components).toEqual([
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

  it("reuses an existing tenant WABA template instead of creating a duplicate", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: "template-123",
              name: WHATSAPP_REOPEN_TEMPLATE_NAME,
              language: "it",
              status: "APPROVED",
              category: "MARKETING",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await ensureWhatsAppReopenTemplate({
      wabaId: "waba-1",
      graphVersion: "v26.0",
      accessToken: "business-token",
      sampleCompanyName: "Villa Demo",
    })

    expect(result).toEqual({
      ok: true,
      created: false,
      status: "APPROVED",
      templateId: "template-123",
      category: "MARKETING",
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/waba-1/message_templates?")
  })

  it("creates the managed template automatically when a tenant WABA does not have it", async () => {
    const responses = [
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      new Response(JSON.stringify({ id: "template-new", status: "PENDING", category: "MARKETING" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ]
    const fetchMock = vi.fn<typeof fetch>(async () => responses.shift()!)
    vi.stubGlobal("fetch", fetchMock)

    const result = await ensureWhatsAppReopenTemplate({
      wabaId: "waba-2",
      graphVersion: "v26.0",
      accessToken: "business-token",
      sampleCompanyName: "Villa I Barronci Resort & Spa",
    })

    expect(result).toEqual({
      ok: true,
      created: true,
      status: "PENDING",
      templateId: "template-new",
      category: "MARKETING",
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const [, createInit] = fetchMock.mock.calls[1]!
    const requestBody = JSON.parse(String(createInit?.body))
    expect(requestBody.name).toBe(WHATSAPP_REOPEN_TEMPLATE_NAME)
    expect(requestBody.language).toBe("it")
    expect(requestBody.category).toBe("MARKETING")
    expect(requestBody.components).toEqual([
      {
        type: "BODY",
        text: WHATSAPP_REOPEN_TEMPLATE_BODY,
        example: { body_text: [["Villa I Barronci Resort & Spa"]] },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "QUICK_REPLY", text: "Apri comunicazione" },
          { type: "QUICK_REPLY", text: "Non ora" },
        ],
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
