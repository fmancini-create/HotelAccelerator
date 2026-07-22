import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params

  try {
    // Verify binding exists and is ACTIVE
    const { data: binding, error: fetchError } = await supabase
      .from("hotel_bindings")
      .select("id, status, hotel_id")
      .eq("id", id)
      .single()

    if (fetchError || !binding) {
      return NextResponse.json({ error: "Binding non trovato" }, { status: 404 })
    }

    if (binding.status !== "ACTIVE") {
      return NextResponse.json(
        { error: `Il binding deve essere ACTIVE per poter essere disattivato (stato attuale: ${binding.status})` },
        { status: 400 },
      )
    }

    // Deactivate binding - set status to SUSPENDED
    const { data: updated, error: updateError } = await supabase
      .from("hotel_bindings")
      .update({
        status: "SUSPENDED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      console.error("Error deactivating binding:", updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      binding: updated,
      message: "Binding disattivato. ETL non eseguirà più per questa struttura.",
    })
  } catch (error: any) {
    console.error("Error in deactivate binding:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
