import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin"
import { computeGoLive } from "@/lib/superadmin/golive-steps"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Stato "andare online" di tutti gli hotel registrati, calcolato dai segnali
 * reali del DB (con override manuali applicati). Solo super_admin.
 */
export async function GET() {
  const denied = await requireSuperAdmin()
  if (denied) return denied

  try {
    const hotels = await computeGoLive()
    return NextResponse.json({ hotels })
  } catch (e) {
    console.error("[v0] superadmin/onboarding GET error:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Errore nel calcolo dello stato onboarding" }, { status: 500 })
  }
}
