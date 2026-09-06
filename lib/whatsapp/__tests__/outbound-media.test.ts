import { describe, expect, it } from "vitest"
import {
  classifyWhatsAppOutboundMedia,
  decodePendingWhatsAppPayload,
  encodePendingWhatsAppPayload,
  expectedOutboundStagingPrefix,
  validateWhatsAppOutboundMedia,
  type StagedWhatsAppMedia,
} from "../outbound-media"

describe("WhatsApp outbound media", () => {
  it("classifies supported media and rejects unsupported formats", () => {
    expect(classifyWhatsAppOutboundMedia("image/jpeg")).toBe("image")
    expect(classifyWhatsAppOutboundMedia("video/mp4")).toBe("video")
    expect(classifyWhatsAppOutboundMedia("audio/ogg;codecs=opus")).toBe("audio")
    expect(classifyWhatsAppOutboundMedia("application/pdf")).toBe("document")
    expect(classifyWhatsAppOutboundMedia("video/webm")).toBeNull()
  })

  it("applies WhatsApp media-size limits", () => {
    expect(validateWhatsAppOutboundMedia("foto.jpg", "image/jpeg", 5 * 1024 * 1024).ok).toBe(true)
    const tooLarge = validateWhatsAppOutboundMedia("foto.jpg", "image/jpeg", 5 * 1024 * 1024 + 1)
    expect(tooLarge.ok).toBe(false)
    if (!tooLarge.ok) expect(tooLarge.error).toContain("5 MB")

    expect(validateWhatsAppOutboundMedia("video.mp4", "video/mp4", 16 * 1024 * 1024).ok).toBe(true)
    expect(validateWhatsAppOutboundMedia("menu.pdf", "application/pdf", 20 * 1024 * 1024).ok).toBe(true)
  })

  it("keeps staged media and voice-note intent across the 24h reopen queue", () => {
    const media: StagedWhatsAppMedia = {
      path: "property-a/whatsapp-outbound/channel-a/vocale.ogg",
      name: "vocale.ogg",
      mimeType: "audio/ogg",
      size: 12345,
      voice: true,
    }
    const encoded = encodePendingWhatsAppPayload("Testo dopo il vocale", media)
    expect(encoded).not.toBe("Testo dopo il vocale")
    expect(decodePendingWhatsAppPayload(encoded)).toEqual({
      text: "Testo dopo il vocale",
      media,
    })
  })

  it("keeps legacy text-only pending rows unchanged", () => {
    expect(encodePendingWhatsAppPayload("ciao", null)).toBe("ciao")
    expect(decodePendingWhatsAppPayload("ciao")).toEqual({ text: "ciao", media: null })
  })

  it("scopes staged media paths to tenant and WhatsApp channel", () => {
    expect(expectedOutboundStagingPrefix("property-a", "channel-b")).toBe(
      "property-a/whatsapp-outbound/channel-b/",
    )
  })
})
