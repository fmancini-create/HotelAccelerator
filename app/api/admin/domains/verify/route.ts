import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"
import { inspectProjectDomain, verifyProjectDomain } from "@/lib/vercel/project-domains"

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const db = createServiceClient()
    const { data: property, error } = await db
      .from("properties")
      .select("custom_domain")
      .eq("id", propertyId)
      .single()
    if (error || !property) return NextResponse.json({ error: "Struttura non trovata" }, { status: 404 })
    if (!property.custom_domain) return NextResponse.json({ error: "Nessun dominio da verificare" }, { status: 400 })

    await verifyProjectDomain(property.custom_domain)
    const readiness = await inspectProjectDomain(property.custom_domain)
    const ownership = readiness.dns.find((item) => item.purpose === "ownership")
    const { error: updateError } = await db
      .from("properties")
      .update({
        domain_status: readiness.ready ? "active" : "pending_verification",
        domain_verification_token: ownership?.value ?? null,
        domain_verified_at: readiness.ready ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", propertyId)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    return NextResponse.json({
      verified: readiness.ready,
      readiness,
      message: readiness.ready ? "Dominio verificato e DNS operativo" : readiness.message,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto"
    return NextResponse.json(
      { verified: false, message: "Verifica Vercel non riuscita; riprova dopo la propagazione DNS" },
      { status: message.includes("Non autenticato") ? 401 : 502 },
    )
  }
}
