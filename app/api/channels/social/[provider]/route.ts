import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"
import { getSocialProvider, isSocialProvider, providerEnvReady, xDmRequested } from "@/lib/social/providers"

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: raw } = await context.params
  const providerId = raw === "twitter" ? "x" : raw
  if (!isSocialProvider(providerId)) return NextResponse.json({ error: "Provider non supportato" }, { status: 404 })
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const provider = getSocialProvider(providerId)
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("messaging_channels")
      .select("id, channel_type, display_name, config, is_active, last_inbound_at, last_outbound_at, last_error, updated_at")
      .eq("property_id", propertyId)
      .eq("channel_type", provider.channelType)
      .order("created_at", { ascending: true })
    if (error) throw error
    return NextResponse.json({
      provider,
      appConfigured: providerEnvReady(provider.id),
      xDmRequested: provider.id === "x" ? xDmRequested() : undefined,
      accounts: data || [],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    return NextResponse.json({ error: message }, { status: message.toLowerCase().includes("autentic") ? 401 : 500 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: raw } = await context.params
  const providerId = raw === "twitter" ? "x" : raw
  if (!isSocialProvider(providerId)) return NextResponse.json({ error: "Provider non supportato" }, { status: 404 })
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const id = request.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 })
    const provider = getSocialProvider(providerId)
    const supabase = createServiceClient()
    const { error } = await supabase
      .from("messaging_channels")
      .delete()
      .eq("id", id)
      .eq("property_id", propertyId)
      .eq("channel_type", provider.channelType)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    return NextResponse.json({ error: message }, { status: message.toLowerCase().includes("autentic") ? 401 : 500 })
  }
}
