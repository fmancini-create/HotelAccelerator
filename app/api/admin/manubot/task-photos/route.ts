import { type NextRequest, NextResponse } from "next/server"

import { getCallerIdentity } from "@/lib/auth/admin-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"
import { getManubotClient } from "@/lib/manubot"
import { categorizeManubotError, logManubotError } from "@/lib/manubot/route-errors"
import { loadManubotPropertyForCaller } from "@/lib/manubot/tenant-context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_FILES = 5
const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_BYTES = 25 * 1024 * 1024
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

/** Carica le foto direttamente nello storage nativo di ManuBot. */
export async function POST(request: NextRequest) {
  try {
    await requireAreaApi("todos", request)
    const identity = await getCallerIdentity(request)
    if (!identity) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const resolved = await loadManubotPropertyForCaller(
      identity,
      request.nextUrl.searchParams.get("property_id"),
    )
    if (!resolved.ok) {
      return NextResponse.json(
        { error: resolved.error, message: resolved.message },
        { status: resolved.status },
      )
    }

    const formData = await request.formData()
    const files = formData.getAll("files").filter((value): value is File => value instanceof File)
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0)

    if (
      files.length === 0
      || files.length > MAX_FILES
      || totalBytes > MAX_TOTAL_BYTES
      || files.some((file) => file.size <= 0 || file.size > MAX_FILE_BYTES || !ALLOWED_TYPES.has(file.type))
    ) {
      return NextResponse.json(
        { error: "Sono consentite fino a 5 foto JPEG/PNG/WebP, max 10 MB ciascuna e 25 MB complessivi." },
        { status: 400 },
      )
    }

    const client = await getManubotClient(resolved.property)
    const photos = await client.uploadTaskPhotos(files)
    return NextResponse.json({ photos }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const category = categorizeManubotError(error)
    logManubotError("manubot/task-photos", error, category)
    return NextResponse.json({ error: category }, { status: 502 })
  }
}
