import { createServiceClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { verifyProjectDomain } from "@/lib/vercel/project-domains"

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId()

    const supabase = createServiceClient()

    // Ottieni property con token
    const { data: property, error: fetchError } = await supabase
      .from("properties")
      .select("custom_domain, domain_verification_token")
      .eq("id", propertyId)
      .single()

    if (fetchError || !property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    if (!property.custom_domain) {
      return NextResponse.json({ error: "No domain to verify" }, { status: 400 })
    }

    const result = await verifyProjectDomain(property.custom_domain)
    const isVerified = result.verified

    if (isVerified) {
      // Aggiorna stato a verified
      const { error: updateError } = await supabase
        .from("properties")
        .update({
          domain_status: "active",
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
        expected: result.verification ?? property.domain_verification_token,
      })
    }
  } catch (verificationError: unknown) {
    const errorMessage = verificationError instanceof Error ? verificationError.message : "Unknown verification error"
    return NextResponse.json({
      verified: false,
      message: `Verifica Vercel non riuscita: ${errorMessage}. Controlla i record DNS richiesti.`,
    })
  }
}
