import { createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function PATCH(request: Request) {
  try {
    const supabase = await createServerClient()

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get updates from request
    const { updates } = await request.json()

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: "updates array is required" }, { status: 400 })
    }

    console.log("[v0] Updating rates:", updates.length)

    // Update each rate
    const updatePromises = updates.map(async (update) => {
      const { id, is_active } = update

      return supabase
        .from("rates")
        .update({
          is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
    })

    const results = await Promise.all(updatePromises)

    // Check for errors
    const errors = results.filter((r) => r.error)
    if (errors.length > 0) {
      console.error("[v0] Errors updating rates:", errors)
      return NextResponse.json({ error: "Failed to update some rates", details: errors }, { status: 500 })
    }

    console.log("[v0] Successfully updated rates:", updates.length)

    return NextResponse.json({
      message: "Rates updated successfully",
      count: updates.length,
    })
  } catch (error) {
    console.error("[v0] Error updating rates:", error)
    return NextResponse.json(
      {
        error: "Failed to update rates",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
