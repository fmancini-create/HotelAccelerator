import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

// GET - Carica etichette e il loro stato di sincronizzazione
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: channelId } = await params
    const { propertyId } = await getAuthenticatedPropertyId(request)

    const supabase = await createClient()

    // Carica le etichette dal database
    const { data: labels, error } = await supabase
      .from("email_labels")
      .select("*")
      .eq("channel_id", channelId)
      .eq("property_id", propertyId)
      .order("name")

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ labels: labels || [] })
  } catch (error) {
    console.error("Error loading email labels:", error)
    return NextResponse.json({ error: "Errore nel caricamento delle etichette" }, { status: 500 })
  }
}

// PATCH - Aggiorna stato sincronizzazione etichetta
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: channelId } = await params
    const { propertyId } = await getAuthenticatedPropertyId(request)
    const body = await request.json()

    const { labelId, syncEnabled } = body

    if (!labelId) {
      return NextResponse.json({ error: "labelId richiesto" }, { status: 400 })
    }

    const supabase = await createClient()

    // Aggiorna l'etichetta - usiamo il campo color per memorizzare lo stato sync
    // (o possiamo aggiungere un campo sync_enabled alla tabella email_labels)
    const { error } = await supabase
      .from("email_labels")
      .update({
        // Usiamo il campo type per memorizzare lo stato: "synced" o "ignored"
        type: syncEnabled ? "synced" : "ignored",
        updated_at: new Date().toISOString(),
      })
      .eq("id", labelId)
      .eq("channel_id", channelId)
      .eq("property_id", propertyId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating email label:", error)
    return NextResponse.json({ error: "Errore nell'aggiornamento dell'etichetta" }, { status: 500 })
  }
}
