import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import dns from "dns"
import { promisify } from "util"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

const resolveTxt = promisify(dns.resolveTxt)

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId()

    const supabase = await createClient()

    // Ottieni property con token
    const { data: property, error: fetchError } = await supabase
      .from("properties")
      .select("custom_domain, domain_verification_token")
      .eq("id", propertyId)
      .single()

    if (fetchError || !property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    if (!property.custom_domain || !property.domain_verification_token) {
      return NextResponse.json({ error: "No domain to verify" }, { status: 400 })
    }

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
        .eq("id", propertyId)

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
