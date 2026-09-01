import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { GET as providerGet, POST as providerPost } from "../apollo/route"

function sanitizeText(value: string) {
  return value
    .replace(/Apollo\.io/gi, "HotelAccelerator Scout")
    .replace(/Apollo/gi, "Scout")
    .replace(/APOLLO_API_KEY/g, "configurazione Scout")
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeText(value)
  if (Array.isArray(value)) return value.map(sanitizeValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeValue(item)]),
    )
  }
  return value
}

async function sanitizeResponse(response: Response) {
  const contentType = response.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) return response

  const payload = await response.json().catch(() => null)
  const headers = new Headers(response.headers)
  headers.delete("content-length")

  return NextResponse.json(sanitizeValue(payload), {
    status: response.status,
    headers,
  })
}

export async function GET(request: NextRequest) {
  return sanitizeResponse(await providerGet(request))
}

export async function POST(request: NextRequest) {
  return sanitizeResponse(await providerPost(request))
}
