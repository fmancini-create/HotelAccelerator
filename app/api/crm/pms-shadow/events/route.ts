import { type NextRequest, NextResponse } from "next/server"

import { requireAreaApi } from "@/lib/auth/area-access"
import { areaDeniedResponse, isAreaDenied } from "@/lib/auth/area-denied"
import {
  accessErrorStatus,
  adminUserIdPerDatabase,
  getCallerIdentity,
  isAccessError,
  requireTenantAdmin,
} from "@/lib/auth/admin-access"
import { SOGLIA_AUTONOMIA_PREDEFINITA } from "@/lib/pms/shadow/procedures"
import {
  registraTracciaShadow,
  ShadowTraceValidationError,
  type ShadowSource,
} from "@/lib/pms/shadow/store"
import { createServiceClient } from "@/lib/supabase/server"

/**
 * Contratto generale dell'apprendimento PMS.
 *
 * Il browser remoto usa la route dedicata `/observer`, che puo' attribuire i
 * gesti all'operatore autenticato senza richiedere privilegi amministrativi.
 * Questo POST resta la porta tecnica per sorgenti future (per esempio una
 * estensione) e, finche' non esiste una credenziale dedicata, resta limitato
 * agli amministratori del tenant. Entrambi convergono nello stesso store e
 * quindi applicano le stesse regole di privacy, concorrenza e rischio.
 */
export const maxDuration = 30

async function identificaScrittore(request: NextRequest) {
  const decision = await requireAreaApi("crm", request)
  if (isAreaDenied(decision)) return { negato: areaDeniedResponse(decision) as NextResponse }
  try {
    const identity = await requireTenantAdmin(request)
    return { identity, propertyId: identity.propertyId }
  } catch (error) {
    if (isAccessError(error)) {
      return {
        negato: NextResponse.json(
          { error: error instanceof Error ? error.message : "Accesso negato" },
          { status: accessErrorStatus(error) },
        ) as NextResponse,
      }
    }
    throw error
  }
}

export async function POST(request: NextRequest) {
  const who = await identificaScrittore(request)
  if (who.negato) return who.negato

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Corpo non leggibile" }, { status: 400 })
  }

  const source = body.source === "remote_browser" || body.source === "extension" ? (body.source as ShadowSource) : null
  if (!source) {
    return NextResponse.json(
      { error: "Sorgente non riconosciuta: attese remote_browser o extension" },
      { status: 400 },
    )
  }

  try {
    const result = await registraTracciaShadow({
      propertyId: who.propertyId!,
      // Il tipo e' un identificatore logico della sorgente. Non viene piu'
      // vincolato al registro dei connettori API: ADR-017 rende il browser PMS
      // esplicitamente agnostico dal provider.
      pmsType: typeof body.pmsType === "string" ? body.pmsType : "",
      source,
      rawSteps: Array.isArray(body.steps) ? body.steps : [],
      operatorId: adminUserIdPerDatabase(who.identity!.adminUserId),
      operatorLabel: who.identity!.fullName ?? who.identity!.email,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    if (error instanceof ShadowTraceValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error("[pms-shadow] traccia non salvata", {
      propertyId: who.propertyId,
      detail: error instanceof Error ? error.message : "Errore sconosciuto",
    })
    return NextResponse.json({ error: "Traccia non salvata" }, { status: 500 })
  }
}

async function identificaLettore(request: NextRequest) {
  const decision = await requireAreaApi("pms_learning", request)
  if (isAreaDenied(decision)) return { negato: areaDeniedResponse(decision) as NextResponse }

  const identity = await getCallerIdentity(request)
  if (!identity) {
    return { negato: NextResponse.json({ error: "Non autenticato" }, { status: 401 }) as NextResponse }
  }
  if (!identity.propertyId) {
    return {
      negato: NextResponse.json({ error: "Nessuna struttura attiva selezionata" }, { status: 400 }) as NextResponse,
    }
  }
  return { propertyId: identity.propertyId }
}

export async function GET(request: NextRequest) {
  const who = await identificaLettore(request)
  if (who.negato) return who.negato

  const sb = createServiceClient()
  const { data, error } = await sb
    .from("pms_observed_procedures")
    .select("id, pms_type, title, occurrences, risk, status, autonomy_threshold, steps_summary, first_seen_at, last_seen_at")
    .eq("property_id", who.propertyId!)
    .order("occurrences", { ascending: false })
    .limit(100)

  if (error) {
    console.error("[pms-shadow] lettura procedure non riuscita", {
      propertyId: who.propertyId,
      detail: error.message,
    })
    return NextResponse.json({ error: "Lettura non riuscita" }, { status: 500 })
  }

  return NextResponse.json({
    procedure: data ?? [],
    sogliaPredefinita: SOGLIA_AUTONOMIA_PREDEFINITA,
  })
}
