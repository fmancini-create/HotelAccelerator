import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getChannelAccess, canAccessEmailChannel } from "@/lib/channel-access"
import { SENZA_CARTELLA, SENZA_CARTELLA_NOME } from "@/lib/inbox/folder-visibility"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: channelId } = await params
    const propertyId = await getAuthenticatedPropertyId(request)

    const access = await getChannelAccess(request)
    if (!(await canAccessEmailChannel(access, propertyId, channelId, "read"))) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
    }
    const supabase = access.supabase

    const { data: labels, error } = await supabase
      .from("email_labels")
      .select("*")
      .eq("channel_id", channelId)
      .eq("property_id", propertyId)
      .order("name")

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ labels: labels || [] })
  } catch (error) {
    console.error("Error loading email labels:", error)
    return NextResponse.json({ error: "Errore nel caricamento delle etichette" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: channelId } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const body = await request.json()

    const { labelId, visible, name } = body
    if (!labelId || typeof labelId !== "string") {
      return NextResponse.json({ error: "labelId richiesto" }, { status: 400 })
    }
    if (typeof visible !== "boolean") {
      return NextResponse.json({ error: "visible deve essere true o false" }, { status: 400 })
    }

    const access = await getChannelAccess(request)
    if (!(await canAccessEmailChannel(access, propertyId, channelId, "manage"))) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
    }
    const supabase = access.supabase

    const nomeCartella =
      labelId === SENZA_CARTELLA ? SENZA_CARTELLA_NOME : typeof name === "string" && name.trim() ? name.trim() : labelId

    const { error } = await supabase.from("email_labels").upsert(
      {
        channel_id: channelId,
        property_id: propertyId,
        gmail_id: labelId,
        name: nomeCartella,
        visible_in_inbox: visible,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "channel_id,gmail_id" },
    )

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, visible })
  } catch (error) {
    console.error("Error updating email label:", error)
    return NextResponse.json({ error: "Errore nell'aggiornamento dell'etichetta" }, { status: 500 })
  }
}
