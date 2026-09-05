import { NextResponse, type NextRequest } from "next/server"
import { accessErrorStatus } from "@/lib/auth/admin-access"
import { accessTokenForSource, requireCalendarIdentity, resolveCalendarSource } from "@/lib/calendar/access"
import { uploadGoogleDriveAttachment } from "@/lib/calendar/google-user-calendar"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_FILES = 10
const MAX_TOTAL_BYTES = 4 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const identity = await requireCalendarIdentity(request)
    const form = await request.formData()
    const sourceId = String(form.get("sourceId") || "")
    if (!sourceId) return NextResponse.json({ error: "Calendario obbligatorio" }, { status: 400 })

    const source = await resolveCalendarSource(identity, sourceId, "edit")
    if (source.auth_mode !== "oauth") {
      return NextResponse.json({ error: "Gli allegati richiedono un calendario Google collegato con OAuth" }, { status: 400 })
    }

    const files = form.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0)
    if (!files.length) return NextResponse.json({ error: "Seleziona almeno un file" }, { status: 400 })
    if (files.length > MAX_FILES) return NextResponse.json({ error: `Puoi allegare al massimo ${MAX_FILES} file alla volta` }, { status: 400 })

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: "Gli allegati selezionati superano 4 MB complessivi. Caricali in più passaggi." }, { status: 413 })
    }

    const token = await accessTokenForSource(source)
    const attachments = []
    for (const file of files) {
      attachments.push(await uploadGoogleDriveAttachment(token, file))
    }
    return NextResponse.json({ attachments })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossibile caricare gli allegati"
    const friendly = message === "google_drive_reconnect_required"
      ? "Per allegare file, ricollega Google Calendar e autorizza anche Google Drive."
      : message === "google_drive_api_disabled"
        ? "Google Drive API non è attiva nel progetto Google Cloud. Attivala e riprova."
        : message
    return NextResponse.json({ error: friendly }, { status: accessErrorStatus(error) || 500 })
  }
}
