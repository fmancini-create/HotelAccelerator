import { type NextRequest, NextResponse } from "next/server"
import { handleServiceError } from "@/lib/errors"
import { richiediOperatore } from "@/lib/inbox/identity"
import { leggiBersaglio } from "@/lib/inbox/target"
import {
  aggiungiCoassegnatario,
  rimuoviCoassegnatario,
  statoCollaborazioneTarget,
  utentiCoassegnabili,
} from "@/lib/inbox/coassignment"

export async function GET(request: NextRequest) {
  try {
    const { titolare, propertyId, isAdmin } = await richiediOperatore(request)
    const url = new URL(request.url)
    const target = leggiBersaglio({ kind: url.searchParams.get("kind"), key: url.searchParams.get("key") })
    if (!target) return NextResponse.json({ error: "Conversazione non indicata" }, { status: 400 })

    const [state, users] = await Promise.all([
      statoCollaborazioneTarget({ propertyId, target, actor: titolare, isAdmin }),
      utentiCoassegnabili(propertyId),
    ])
    return NextResponse.json({ state, users })
  } catch (error) {
    return handleServiceError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { titolare, propertyId, isAdmin } = await richiediOperatore(request)
    const body = await request.json().catch(() => null)
    const target = leggiBersaglio(body?.target)
    const userId = typeof body?.userId === "string" ? body.userId.trim() : ""
    if (!target || !userId) return NextResponse.json({ error: "Conversazione o utente mancanti" }, { status: 400 })

    await aggiungiCoassegnatario({ propertyId, target, actor: titolare, isAdmin, userId })
    const state = await statoCollaborazioneTarget({ propertyId, target, actor: titolare, isAdmin })
    return NextResponse.json({ state })
  } catch (error) {
    return handleServiceError(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { titolare, propertyId, isAdmin } = await richiediOperatore(request)
    const body = await request.json().catch(() => null)
    const target = leggiBersaglio(body?.target)
    const userId = typeof body?.userId === "string" ? body.userId.trim() : ""
    if (!target || !userId) return NextResponse.json({ error: "Conversazione o utente mancanti" }, { status: 400 })

    await rimuoviCoassegnatario({ propertyId, target, actor: titolare, isAdmin, userId })
    const state = await statoCollaborazioneTarget({ propertyId, target, actor: titolare, isAdmin })
    return NextResponse.json({ state })
  } catch (error) {
    return handleServiceError(error)
  }
}
