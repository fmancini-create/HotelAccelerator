import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { photo_id, category_ids } = await request.json()

    if (!photo_id) {
      return NextResponse.json({ error: "Photo ID required" }, { status: 400 })
    }

    // Delete existing category assignments
    const { error: deleteError } = await supabase.from("photo_category").delete().eq("photo_id", photo_id)

    if (deleteError) {
      console.error("Error deleting old categories:", deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // If no categories selected, just return success
    if (!category_ids || category_ids.length === 0) {
      return NextResponse.json({ success: true, message: "Categories cleared" })
    }

    // Insert new category assignments
    const inserts = category_ids.map((category_id: string) => ({
      photo_id,
      category_id,
    }))

    const { error: insertError } = await supabase.from("photo_category").insert(inserts)

    if (insertError) {
      console.error("Error inserting categories:", insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Assigned ${category_ids.length} categories`,
    })
  } catch (error: any) {
    console.error("Error assigning categories:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
