import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { gmailFetch } from "@/lib/gmail-client"

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)

    const supabase = await createClient()

    // Get default email channel for property
    const { data: channel, error: channelError } = await supabase
      .from("email_channels")
      .select("id")
      .eq("property_id", propertyId)
      .eq("is_default", true)
      .single()

    if (channelError || !channel) {
      // Return empty labels if no channel configured
      return NextResponse.json({ labels: [] })
    }

    // Fetch labels from Gmail API
    const { data, error } = await gmailFetch(channel.id, "labels")

    if (error || !data?.labels) {
      console.error("[v0] Error fetching Gmail labels:", error)
      return NextResponse.json({ labels: [] })
    }

    // Filter to user-created labels (exclude system labels)
    const userLabels = data.labels
      .filter((label: any) => label.type === "user")
      .map((label: any) => ({
        id: label.id,
        name: label.name,
        color: label.color?.backgroundColor || null,
      }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name))

    return NextResponse.json({ labels: userLabels })
  } catch (error) {
    console.error("[v0] Gmail labels error:", error)
    return NextResponse.json({ labels: [] })
  }
}
