import { type NextRequest, NextResponse } from "next/server"
import { del } from "@vercel/blob"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateRevmanAccess } from "@/lib/auth/validateRevmanAccess"

export const dynamic = "force-dynamic"

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServiceRoleClient()
  const { data: existing } = await supabase
    .from("revman_files").select("hotel_id, blob_url").eq("id", id).maybeSingle()
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 })

  const access = await validateRevmanAccess(existing.hotel_id)
  if (!access.granted) return access.response
  if (access.readOnly) return NextResponse.json({ error: "Accesso in sola lettura" }, { status: 403 })

  // Cancella prima il record poi il blob (best-effort).
  const { error } = await supabase.from("revman_files").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try { await del(existing.blob_url) } catch {}
  return NextResponse.json({ ok: true })
}
