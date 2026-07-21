import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

/** GET /api/superadmin/onboarding/notes?hotelId=... -> note manuali del go-live. */
export async function GET(req: Request) {
  const denied = await requireSuperAdmin()
  if (denied) return denied

  const hotelId = new URL(req.url).searchParams.get("hotelId")
  if (!hotelId) return NextResponse.json({ error: "hotelId mancante" }, { status: 400 })

  const { supabase } = await getAuthUserOrDev()
  const { data, error } = await supabase
    .from("hotel_onboarding_notes")
    .select("id, note, created_by, created_at")
    .eq("hotel_id", hotelId)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notes: data ?? [] })
}

/** POST { hotelId, note } -> aggiunge una nota alla timeline go-live. */
export async function POST(req: Request) {
  const denied = await requireSuperAdmin()
  if (denied) return denied

  const body = await req.json().catch(() => null)
  const hotelId = body?.hotelId as string | undefined
  const note = (body?.note as string | undefined)?.trim()
  if (!hotelId || !note) return NextResponse.json({ error: "hotelId e note richiesti" }, { status: 400 })

  const { user, supabase } = await getAuthUserOrDev()
  const { data, error } = await supabase
    .from("hotel_onboarding_notes")
    .insert({ hotel_id: hotelId, note, created_by: user?.id ?? null })
    .select("id, note, created_by, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ note: data })
}
