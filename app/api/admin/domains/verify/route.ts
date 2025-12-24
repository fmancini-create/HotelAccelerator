import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import dns from "dns"
import { promisify } from "util"

const resolveTxt = promisify(dns.resolveTxt)

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const body = await request.json()
  const { property_id } = body

  if (!property_id) {
    return NextResponse.json({ error: "property_id required" }, { status: 400 })
  }

  // Ottieni property con token
  const { data: property, error: fetchError } = await supabase
    .from("properties")
    .select("custom_domain, domain_verification_token")
    .eq("id", property_id)
    .single()

  if (fetchError || !property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 })
  }

  if (!property.custom_domain || !property.domain_verification_token) {
    return NextResponse.json({ error: "No domain to verify" }, { status: 400 })
  }

  try {
    // Verifica record TXT
    const records = await resolveTxt(property.custom_domain)
    const flatRecords = records.flat()

    const isVerified = flatRecords.some((record) => record === property.domain_verification_token)

    if (isVerified) {
      // Aggiorna stato a verified
      const { error: updateError } = await supabase
        .from("properties")
        .update({
          domain_status: "verified",
          domain_verified_at: new Date().toISOString(),
        })
        .eq("id", property_id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({
        verified: true,
        message: "Dominio verificato con successo!",
      })
    } else {
      return NextResponse.json({
        verified: false,
        message: "Record TXT non trovato. Assicurati di aver aggiunto il record DNS.",
        expected: property.domain_verification_token,
        found: flatRecords,
      })
    }
  } catch (dnsError: unknown) {
    const errorMessage = dnsError instanceof Error ? dnsError.message : "Unknown DNS error"
    return NextResponse.json({
      verified: false,
      message: `Errore DNS: ${errorMessage}. Verifica che il dominio sia valido.`,
    })
  }
}
