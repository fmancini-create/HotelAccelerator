import "server-only"

const DEFAULT_BASE_URL = "https://operator.las.ap-southeast-1.bytepluses.com/api/v1"
const DEFAULT_MODEL = "dreamina-seedance-2-5-260628"

export interface CreateBytePlusVideoInput {
  prompt: string
  durationSeconds: number
  aspectRatio: "16:9" | "9:16"
  resolution: "720p" | "1080p"
  generateAudio: boolean
}

export interface BytePlusVideoTask {
  id: string
  status: "queued" | "running" | "cancelled" | "succeeded" | "failed" | "expired"
  content?: { video_url?: string; last_frame_url?: string } | null
  error?: { code?: string; message?: string } | null
  resolution?: string
  ratio?: string
  duration?: number
  generate_audio?: boolean
  [key: string]: unknown
}

function config() {
  const apiKey = process.env.BYTEPLUS_VIDEO_API_KEY?.trim()
  if (!apiKey) throw new Error("BYTEPLUS_VIDEO_API_KEY non configurata")
  return {
    apiKey,
    baseUrl: (process.env.BYTEPLUS_VIDEO_API_BASE || DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: process.env.BYTEPLUS_VIDEO_MODEL?.trim() || DEFAULT_MODEL,
  }
}

async function parseResponse(response: Response) {
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!response.ok) {
    const message =
      typeof body === "object" && body && "message" in body
        ? String((body as { message?: unknown }).message || response.statusText)
        : `BytePlus video API ${response.status}: ${response.statusText}`
    throw new Error(message)
  }
  return body
}

/** Start a Seedance 2.5 task. API key is server-only. */
export async function createBytePlusVideoTask(input: CreateBytePlusVideoInput): Promise<{ id: string; raw: unknown }> {
  const { apiKey, baseUrl, model } = config()
  const response = await fetch(`${baseUrl}/contents/generations/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      content: [{ type: "text", text: input.prompt }],
      duration: input.durationSeconds,
      ratio: input.aspectRatio,
      resolution: input.resolution,
      generate_audio: input.generateAudio,
      watermark: false,
    }),
    cache: "no-store",
  })
  const raw = await parseResponse(response)
  const id = typeof raw === "object" && raw && "id" in raw ? String((raw as { id: unknown }).id) : ""
  if (!id) throw new Error("BytePlus non ha restituito l'ID del task video")
  return { id, raw }
}

/** Refresh task state. Provider URLs are short-lived and must be copied to durable storage later. */
export async function getBytePlusVideoTask(taskId: string): Promise<BytePlusVideoTask> {
  const { apiKey, baseUrl } = config()
  const response = await fetch(`${baseUrl}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  })
  const raw = await parseResponse(response)
  if (!raw || typeof raw !== "object") throw new Error("Risposta task BytePlus non valida")
  return raw as BytePlusVideoTask
}
