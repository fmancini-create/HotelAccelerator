/**
 * GET/PUT /api/platform/analytics-sources
 *
 * Quali canali contano nelle statistiche.
 *
 * Tre scelte che vale la pena spiegare:
 *
 * 1. La scrittura e' riservata a chi amministra la struttura. Cambiare le
 *    sorgenti cambia OGNI numero del cruscotto: se un collaboratore potesse
 *    escludere una casella, i responsabili leggerebbero numeri diversi senza
 *    sapere perche'.
 *
 * 2. Si accettano solo sorgenti che esistono davvero in questa struttura. Senza
 *    questo controllo si potrebbe scrivere l'id della casella di un altro hotel:
 *    riga inutile in tabella e, peggio, una conferma di salvataggio per una
 *    scelta che non avra' alcun effetto.
 *
 * 3. Escludere TUTTO e' permesso ma viene dichiarato (`nessunaInclusa`): i
 *    conteggi valgono zero per scelta, e la pagina deve poterlo distinguere da
 *    un guasto.
 */

import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { requireAreaApi } from "@/lib/auth/area-access"
import { listAnalyticsSources } from "@/lib/platform/analytics-sources"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    // Chiave "tracking": e' quella del catalogo che governa le statistiche.
    // "dashboard" NON esiste fra le aree (verificato in lib/platform/nav.ts) e una
    // chiave sconosciuta cade in `not-granted`, cioe' avrebbe negato l'accesso a
    // ogni collaboratore: una guardia che blocca invece di proteggere.
    await requireAreaApi("tracking", request)

    const chi = await getCallerIdentity(request)
    if (!chi?.propertyId) {
      return NextResponse.json({ error: "Sessione non valida" }, { status: 401 })
    }

    const sb = createServiceClient()
    const { sources, filter, leggibile } = await listAnalyticsSources(sb, chi.propertyId)

    return NextResponse.json({
      sources,
      filter,
      // Chi amministra puo' cambiare; agli altri la pagina mostra la scelta in
      // sola lettura invece di comandi che darebbero errore al salvataggio.
      puoModificare: Boolean(chi.isTenantAdmin || chi.isSuperAdmin),
      // Se la lettura della scelta e' fallita i numeri sono quelli storici, ma
      // le spunte a schermo non sono attendibili: va detto.
      sceltaLeggibile: leggibile,
    })
  } catch (e: any) {
    if (e?.status === 403 || e?.status === 401) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: e.status })
    }
    console.log("[v0] analytics-sources GET errore:", e?.message)
    return NextResponse.json({ error: "Errore nel leggere le sorgenti" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAreaApi("tracking", request)

    const chi = await getCallerIdentity(request)
    if (!chi?.propertyId) {
      return NextResponse.json({ error: "Sessione non valida" }, { status: 401 })
    }

    if (!chi.isTenantAdmin && !chi.isSuperAdmin) {
      return NextResponse.json(
        { error: "Solo chi amministra la struttura puo' cambiare le sorgenti statistiche" },
        { status: 403 },
      )
    }

    const body = await request.json().catch(() => null)
    const richieste = Array.isArray(body?.sources) ? body.sources : null
    if (!richieste) {
      return NextResponse.json({ error: "Serve un elenco `sources`" }, { status: 400 })
    }

    const sb = createServiceClient()
    const { sources: reali } = await listAnalyticsSources(sb, chi.propertyId)
    const ammesse = new Map(reali.map((s) => [`${s.kind}:${s.id}`, s]))

    const righe: Array<{
      property_id: string
      source_kind: string
      source_id: string
      included: boolean
      updated_by: string | null
      updated_at: string
    }> = []

    for (const r of richieste) {
      const chiave = `${r?.kind}:${r?.id}`
      if (!ammesse.has(chiave)) {
        // Errore esplicito, non silenzio: una sorgente ignota e' un errore di
        // chi chiama, e ignorarla farebbe apparire "salvato" cio' che non lo e'.
        return NextResponse.json(
          { error: `Sorgente non riconosciuta per questa struttura: ${chiave}` },
          { status: 400 },
        )
      }
      if (typeof r?.included !== "boolean") {
        return NextResponse.json({ error: `Manca included per ${chiave}` }, { status: 400 })
      }
      righe.push({
        property_id: chi.propertyId,
        source_kind: r.kind,
        source_id: r.id,
        included: r.included,
        // `adminUserId` puo' mancare nella scorciatoia di sviluppo: si scrive
        // null invece di far fallire il salvataggio per la traccia dell'autore.
        updated_by: chi.adminUserId && chi.adminUserId !== "dev-admin-id" ? chi.adminUserId : null,
        updated_at: new Date().toISOString(),
      })
    }

    if (righe.length > 0) {
      const { error } = await sb
        .from("analytics_source_selection")
        .upsert(righe, { onConflict: "property_id,source_kind,source_id" })
      if (error) {
        console.log("[v0] analytics-sources PUT upsert errore:", error.message)
        return NextResponse.json({ error: "Salvataggio non riuscito" }, { status: 500 })
      }
    }

    // Si rilegge dal database invece di restituire cio' che e' stato inviato:
    // cosi' la pagina mostra lo stato salvato per davvero.
    const { sources, filter } = await listAnalyticsSources(sb, chi.propertyId)
    return NextResponse.json({ sources, filter, salvate: righe.length })
  } catch (e: any) {
    if (e?.status === 403 || e?.status === 401) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: e.status })
    }
    console.log("[v0] analytics-sources PUT errore:", e?.message)
    return NextResponse.json({ error: "Errore nel salvare le sorgenti" }, { status: 500 })
  }
}
