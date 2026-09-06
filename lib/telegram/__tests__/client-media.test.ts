import { afterEach, describe, expect, it, vi } from "vitest"
import { sendTelegramAudio, sendTelegramVideo, sendTelegramVoice } from "../client"

const credentials = { bot_token: "test-token" }

afterEach(() => {
  vi.unstubAllGlobals()
})

function mockTelegramOk() {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async () =>
      new Response(JSON.stringify({ ok: true, result: { message_id: 321 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("Telegram native outbound media", () => {
  it("sends MP4 through sendVideo and enables streaming", async () => {
    const fetchMock = mockTelegramOk()
    const file = new File(["video"], "clip.mp4", { type: "video/mp4" })

    const result = await sendTelegramVideo(credentials, "123", file)

    expect(result).toEqual({ success: true, externalMessageId: "321" })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain("/sendVideo")
    const form = init?.body as FormData
    expect(form.get("video")).toBeInstanceOf(File)
    expect(form.get("supports_streaming")).toBe("true")
  })

  it("sends MP3/M4A through sendAudio", async () => {
    const fetchMock = mockTelegramOk()
    const file = new File(["audio"], "memo.mp3", { type: "audio/mpeg" })

    const result = await sendTelegramAudio(credentials, "123", file)

    expect(result.success).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain("/sendAudio")
    const form = init?.body as FormData
    expect(form.get("audio")).toBeInstanceOf(File)
  })

  it("sends OGG/Opus through sendVoice", async () => {
    const fetchMock = mockTelegramOk()
    const file = new File(["voice"], "voice.ogg", { type: "audio/ogg" })

    const result = await sendTelegramVoice(credentials, "123", file)

    expect(result.success).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain("/sendVoice")
    const form = init?.body as FormData
    expect(form.get("voice")).toBeInstanceOf(File)
  })
})
