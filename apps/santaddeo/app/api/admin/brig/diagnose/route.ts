/**
 * GET /api/admin/brig/diagnose
 *
 * Spike endpoint: chiama gli endpoint principali della Brig API usando le
 * credenziali di test (env vars BRIG_BASE_URL / BRIG_TEST_STRUCTURE_ID /
 * BRIG_TEST_API_KEY) e ritorna un riepilogo: cosa risponde, quanti elementi,
 * eventuali errori. Serve per verificare che l'integrazione "viva" prima di
 * progettare schema DB e sync.
 *
 * Auth: solo super_admin (controllo via Supabase profile).
 */

import { NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { BrigError, createBrigTestClient } from "@/lib/connectors/brig/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

type StepResult =
  | { ok: true; durationMs: number; summary: string; sample?: unknown }
  | { ok: false; durationMs: number; error: string; httpStatus?: number; bodyPreview?: string }

async function runStep<T>(
  label: string,
  fn: () => Promise<T>,
  summarize: (data: T) => { summary: string; sample?: unknown },
): Promise<{ label: string; result: StepResult }> {
  const startedAt = Date.now()
  try {
    const data = await fn()
    const { summary, sample } = summarize(data)
    return {
      label,
      result: { ok: true, durationMs: Date.now() - startedAt, summary, sample },
    }
  } catch (err) {
    const durationMs = Date.now() - startedAt
    if (err instanceof BrigError) {
      return {
        label,
        result: {
          ok: false,
          durationMs,
          error: err.message,
          httpStatus: err.status,
          bodyPreview: err.body.slice(0, 500),
        },
      }
    }
    const message = err instanceof Error ? err.message : String(err)
    return {
      label,
      result: { ok: false, durationMs, error: message },
    }
  }
}

export async function GET() {
  // Auth: solo super_admin (in dev/sandbox usa il fake user)
  const { user, supabase } = await getAuthUserOrDev()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (profile?.role !== "super_admin" && profile?.role !== "superadmin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  // Build client (errore esplicito se mancano env)
  let client
  try {
    client = createBrigTestClient()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { ok: false, error: message, hint: "Configura BRIG_BASE_URL, BRIG_TEST_STRUCTURE_ID, BRIG_TEST_API_KEY nel progetto Vercel" },
      { status: 500 },
    )
  }

  // Eseguo le 3 chiamate in parallelo: ognuna è isolata, l'errore non blocca le altre.
  const [roomTypes, ratePlans, reservations] = await Promise.all([
    runStep("GET /api/nol/roomtypes/list", () => client.getRoomTypes(), (data) => {
      const arr = Array.isArray(data) ? data : (data as any)?.data ?? (data as any)?.items
      return {
        summary: Array.isArray(arr)
          ? `Restituiti ${arr.length} room types`
          : "Risposta non in formato array — vedi sample per shape",
        sample: Array.isArray(arr) ? arr.slice(0, 3) : data,
      }
    }),
    runStep("GET /api/nol/rateplans/list", () => client.getRatePlans(), (data) => {
      const arr = Array.isArray(data) ? data : (data as any)?.data ?? (data as any)?.items
      return {
        summary: Array.isArray(arr)
          ? `Restituiti ${arr.length} rate plans`
          : "Risposta non in formato array — vedi sample per shape",
        sample: Array.isArray(arr) ? arr.slice(0, 3) : data,
      }
    }),
    runStep(
      "POST /api/ext/reservations/daily-occupancy-filters (page=1, pageSize=10)",
      () => client.getReservations({ page: 1, pageSize: 10 }),
      (data) => {
        const list = (data as any)?.data ?? (data as any)?.reservations ?? (data as any)?.items
        const total = (data as any)?.total ?? (data as any)?.totalElements ?? (Array.isArray(list) ? list.length : undefined)
        return {
          summary: Array.isArray(list)
            ? `Restituite ${list.length} prenotazioni in pagina (totale dichiarato: ${total ?? "n/d"})`
            : "Risposta non in formato atteso — vedi sample per shape",
          sample: Array.isArray(list) ? list.slice(0, 2) : data,
        }
      },
    ),
  ])

  // ──────────────────────────────────────────────────────────────────────
  // Fallback: estrai roomCode / channelCode / marketCode distinti dal sample
  // di prenotazioni. Utile quando `/roomtypes/list` resta in errore (es.
  // sandbox Brig 26/04/2026 → 500 server error): il mapping codici PMS↔RMS
  // può comunque partire usando i codici realmente apparsi nelle prenotazioni.
  // ──────────────────────────────────────────────────────────────────────
  let derivedFromReservations: Record<string, unknown> | null = null
  if (reservations.result.ok) {
    const sample = (reservations.result as Extract<StepResult, { ok: true }>).sample
    if (Array.isArray(sample)) {
      const roomCodes = new Set<string>()
      const channelCodes = new Set<string>()
      const marketCodes = new Set<string>()
      for (const r of sample as Array<Record<string, unknown>>) {
        if (typeof r.roomCode === "string") roomCodes.add(r.roomCode)
        if (typeof r.channelCode === "string") channelCodes.add(r.channelCode)
        if (typeof r.marketCode === "string") marketCodes.add(r.marketCode)
      }
      derivedFromReservations = {
        roomCodes: [...roomCodes].sort(),
        channelCodes: [...channelCodes].sort(),
        marketCodes: [...marketCodes].sort(),
        note: "Estratto dal sample di prenotazioni — utile come bootstrap del mapping codici quando /roomtypes/list non risponde",
      }
    }
  }

  return NextResponse.json({
    ok: true,
    runAt: new Date().toISOString(),
    env: {
      baseUrl: process.env.BRIG_BASE_URL,
      structureIdMasked: maskId(process.env.BRIG_TEST_STRUCTURE_ID),
      apiKeyMasked: maskKey(process.env.BRIG_TEST_API_KEY),
    },
    steps: [roomTypes, ratePlans, reservations],
    derivedFromReservations,
  })
}

function maskKey(key?: string): string {
  if (!key) return "(missing)"
  if (key.length < 8) return "***"
  return `${key.slice(0, 4)}…${key.slice(-4)} (len=${key.length})`
}

function maskId(id?: string): string {
  if (!id) return "(missing)"
  if (id.length < 6) return "***"
  return `${id.slice(0, 3)}…${id.slice(-3)} (len=${id.length})`
}
