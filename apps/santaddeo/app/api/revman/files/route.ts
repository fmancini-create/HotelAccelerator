import { type NextRequest, NextResponse } from "next/server"
import { put, del } from "@vercel/blob"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateRevmanAccess } from "@/lib/auth/validateRevmanAccess"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Limite 25 MB per file (relazioni, presentazioni, fogli excel, foto).
const MAX_BYTES = 25 * 1024 * 1024

export async function GET(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get("hotel_id")
  if (!hotelId) return NextResponse.json({ error: "hotel_id required" }, { status: 400 })

  const access = await validateRevmanAccess(hotelId)
  if (!access.granted) return access.response

  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase
    .from("revman_files")
    .select("id, hotel_id, file_name, mime_type, size_bytes, blob_url, category, description, uploaded_by_role, uploaded_at")
    .eq("hotel_id", hotelId)
    .order("uploaded_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Espone uploaded_at anche come created_at per compatibilita' con il client
  const files = (data || []).map((r: any) => ({ ...r, created_at: r.uploaded_at }))
  return NextResponse.json({ files })
}

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const hotelId = String(formData.get("hotel_id") || "")
  const file = formData.get("file") as File | null
  const description = String(formData.get("description") || "") || null
  const category = String(formData.get("category") || "general") as
    | "relazione"
    | "documento"
    | "report"
    | "presentazione"
    | "general"

  if (!hotelId || !file) {
    return NextResponse.json({ error: "hotel_id e file sono richiesti" }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File troppo grande (max ${MAX_BYTES / 1024 / 1024} MB)` }, { status: 400 })
  }

  const access = await validateRevmanAccess(hotelId)
  if (!access.granted) return access.response
  if (access.readOnly) {
    return NextResponse.json({ error: "Accesso in sola lettura" }, { status: 403 })
  }

  const { user } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 })

  const supabase = await createServiceRoleClient()
  const isStaff = access.role === "super_admin" || access.role === "superadmin"

  // Upload su Vercel Blob privato; il path codifica hotel_id per audit.
  // Lo store del progetto e' configurato come "private", quindi serve
  // access: "private". L'URL ritornato richiedera' autenticazione per il
  // download (gestito lato server quando si genera il link di download).
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const blob = await put(
    `revman/${hotelId}/${Date.now()}-${safeName}`,
    file,
    {
      access: "private",
      contentType: file.type || "application/octet-stream",
      addRandomSuffix: true,
    } as any,
  )

  const { data, error } = await supabase
    .from("revman_files")
    .insert({
      hotel_id: hotelId,
      // Colonne nuove (schema-fix applicato)
      file_name: file.name,
      mime_type: file.type || null,
      uploaded_by_role: isStaff ? "staff" : "tenant",
      // Colonne vecchie (schema base, possono ancora essere NOT NULL se il
      // fix non e' stato eseguito): popoliamo entrambe per essere robusti.
      filename: file.name,
      content_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      blob_url: blob.url,
      // Colonna legacy NOT NULL nello schema base: popoliamo il pathname.
      blob_pathname: (blob as any).pathname ?? `revman/${hotelId}/${Date.now()}-${safeName}`,
      category,
      description,
      uploaded_by: user.id,
    } as any)
    .select()
    .single()
  if (error) {
    // best-effort cleanup blob
    try { await del(blob.url) } catch {}
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ file: data })
}
