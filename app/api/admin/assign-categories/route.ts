import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()
    const { photo_id, category_ids } = await request.json()

    if (!photo_id) {
      return NextResponse.json({ error: "Photo ID required" }, { status: 400 })
    }

    if (!Array.isArray(category_ids) || category_ids.some((id) => typeof id !== "string")) {
      return NextResponse.json({ error: "Category IDs must be an array" }, { status: 400 })
    }

    const { data: photo, error: photoError } = await supabase
      .from("photos")
      .select("id")
      .eq("id", photo_id)
      .eq("property_id", propertyId)
      .maybeSingle()
    if (photoError) return NextResponse.json({ error: photoError.message }, { status: 500 })
    if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 })

    const uniqueCategoryIds = [...new Set<string>(category_ids)]
    if (uniqueCategoryIds.length > 0) {
      const { data: ownedCategories, error: categoryError } = await supabase
        .from("categories")
        .select("id")
        .eq("property_id", propertyId)
        .in("id", uniqueCategoryIds)
      if (categoryError) return NextResponse.json({ error: categoryError.message }, { status: 500 })
      if ((ownedCategories?.length ?? 0) !== uniqueCategoryIds.length) {
        return NextResponse.json({ error: "One or more categories are not available" }, { status: 403 })
      }
    }

    // Delete existing assignments only after ownership has been verified.
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
    const inserts = uniqueCategoryIds.map((category_id: string) => ({
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
