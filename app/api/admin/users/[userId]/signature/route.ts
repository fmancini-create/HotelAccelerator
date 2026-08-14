import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCallerIdentity, AccessError, accessErrorStatus } from "@/lib/auth/admin-access"
import { sanitizeSignatureHtml, htmlToPlainText } from "@/lib/html-sanitize"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"

/**
 * Legge la firma di un utente.
 *
 * Serve alla Inbox per MOSTRARE all'operatore la firma che verra' aggiunta in
 * fondo al messaggio: prima veniva accodata solo dal server al momento
 * dell'invio, quindi si scriveva senza sapere cosa sarebbe partito davvero.
 * Stessa regola di accesso della scrittura: la propria sempre, quella di altri
 * solo agli amministratori.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params
    const caller = await getCallerIdentity(request)
    if (!caller) throw new AccessError("Non autenticato", 401)
    const isSelf = caller.adminUserId === userId
    if (!isSelf && !caller.isSuperAdmin && !caller.isTenantAdmin) {
      throw new AccessError("Accesso negato", 403)
    }
    if (!caller.propertyId) throw new AccessError("Nessun tenant selezionato", 400)

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("admin_users")
      .select("signature_html, signature")
      .eq("id", userId)
      // Limitato al tenant come la PUT: senza questo filtro si potrebbe leggere
      // la firma di un utente di un'altra struttura.
      .eq("property_id", caller.propertyId)
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: "Utente non trovato" }, { status: 404 })

    // Ripulito anche in lettura, non solo in scrittura: la Inbox lo disegna
    // come HTML, quindi il browser non deve mai ricevere marcatura grezza
    // (una firma salvata da una versione precedente potrebbe non essere
    // passata dalla pulizia attuale).
    const html = data.signature_html ? sanitizeSignatureHtml(data.signature_html) : null

    return NextResponse.json({
      signature_html: html,
      signature: data.signature ?? null,
    })
  } catch (error: any) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params
    // A user may edit their OWN signature; editing someone else's is admin-only.
    const caller = await getCallerIdentity(request)
    if (!caller) throw new AccessError("Non autenticato", 401)
    const isSelf = caller.adminUserId === userId
    if (!isSelf && !caller.isSuperAdmin && !caller.isTenantAdmin) {
      throw new AccessError("Accesso negato", 403)
    }
    if (!caller.propertyId) throw new AccessError("Nessun tenant selezionato", 400)
    const propertyId = caller.propertyId
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
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}
