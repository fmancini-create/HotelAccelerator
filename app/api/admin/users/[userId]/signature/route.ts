import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { sanitizeSignatureHtml, htmlToPlainText } from "@/lib/html-sanitize"

export async function PUT(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()
    const body = await request.json()

    // Accept both shapes:
    //   - { signature_html: "<div>...</div>" }  (new rich editor)
    //   - { signature: "plain text" }           (legacy textarea callers)
    const rawHtml: string = body.signature_html ?? body.signature ?? ""

    const signatureHtml = sanitizeSignatureHtml(rawHtml)
    const signaturePlain = htmlToPlainText(signatureHtml)

    // Verify user belongs to this property.
    const { data: user, error: checkError } = await supabase
      .from("admin_users")
      .select("id, property_id")
      .eq("id", userId)
      .eq("property_id", propertyId)
      .single()

    if (checkError || !user) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 })
    }

    const { error } = await supabase
      .from("admin_users")
      .update({
        signature: signaturePlain,
        signature_html: signatureHtml,
      })
      .eq("id", userId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
