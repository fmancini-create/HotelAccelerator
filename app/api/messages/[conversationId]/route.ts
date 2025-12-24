import { NextResponse } from "next/server"

// Questa route esiste solo per catturare richieste vecchie
// e restituire un errore appropriato invece di un crash

export async function GET(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params

  // Validazione UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  if (!uuidRegex.test(conversationId)) {
    // Non è un UUID valido - potrebbe essere "conversations" o altra stringa
    return NextResponse.json(
      { error: "Route deprecata. Usa /api/inbox/conversations", conversations: [] },
      { status: 400 },
    )
  }

  // Redirect alla nuova route
  return NextResponse.redirect(new URL(`/api/inbox/${conversationId}`, request.url))
}

export async function PATCH(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params
  return NextResponse.redirect(new URL(`/api/inbox/${conversationId}`, request.url))
}
