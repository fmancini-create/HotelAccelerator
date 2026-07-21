import { createServiceRoleClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET - list contacts with optional search
export async function GET(req: Request) {
  const supabase = await createServiceRoleClient()
  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search") || ""
  const tag = searchParams.get("tag") || ""

  let query = supabase
    .from("marketing_contacts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500)

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`)
  }
  if (tag) {
    query = query.contains("tags", [tag])
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

// POST - create contact or bulk import
export async function POST(req: Request) {
  const supabase = getSupabase()
  const body = await req.json()

  // Bulk import
  if (Array.isArray(body.contacts)) {
    const contacts = body.contacts.map((c: any) => ({
      name: c.name || "",
      email: c.email,
      company: c.company || null,
      tags: c.tags || body.tags || [],
      source: body.source || "import",
    }))

    // Upsert by email
    const results = { imported: 0, skipped: 0, errors: 0 }
    for (const contact of contacts) {
      if (!contact.email) { results.skipped++; continue }
      const { error } = await supabase
        .from("marketing_contacts")
        .upsert(contact, { onConflict: "email", ignoreDuplicates: true })
      if (error) results.errors++
      else results.imported++
    }
    return NextResponse.json(results)
  }

  // Single contact
  const { data, error } = await supabase
    .from("marketing_contacts")
    .insert({
      name: body.name,
      email: body.email,
      company: body.company || null,
      tags: body.tags || [],
      source: body.source || "manual",
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE - delete contact
export async function DELETE(req: Request) {
  const supabase = getSupabase()
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { error } = await supabase.from("marketing_contacts").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
