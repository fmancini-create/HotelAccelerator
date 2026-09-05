import { NextRequest, NextResponse } from "next/server"

import { getAuthenticatedUserEmail } from "@/lib/auth-property"
import { handleServiceError } from "@/lib/errors"
import { SuperAdminService } from "@/lib/platform-services"
import { isSuiteAnalyticsPlatform } from "@/lib/platform/suite-analytics"
import { createServiceClient } from "@/lib/supabase/server"

const DATE = /^\d{4}-\d{2}-\d{2}$/

async function requireSuperAdmin(request: NextRequest) {
  const email = await getAuthenticatedUserEmail(request)
  await new SuperAdminService().verifySuperAdmin(email)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  try {
    await requireSuperAdmin(request)
    const { platform } = await params
    if (!isSuiteAnalyticsPlatform(platform)) {
      return NextResponse.json({ error: "Piattaforma non riconosciuta" }, { status: 404 })
    }

    const start = request.nextUrl.searchParams.get("start")
    const end = request.nextUrl.searchParams.get("end")
    if (!start || !end || !DATE.test(start) || !DATE.test(end) || start > end) {
      return NextResponse.json({ error: "Intervallo non valido" }, { status: 400 })
    }

    const from = new Date(`${start}T00:00:00Z`).getTime()
    const to = new Date(`${end}T00:00:00Z`).getTime()
    if (!Number.isFinite(from) || !Number.isFinite(to) || to - from > 366 * 86400_000) {
      return NextResponse.json({ error: "L'intervallo massimo e 366 giorni" }, { status: 400 })
    }

    const supabase = createServiceClient()
    const [{ data: detail, error: detailError }, { data: platformRow, error: platformError }] = await Promise.all([
      supabase.rpc("get_suite_analytics_platform_detail", {
        p_platform_key: platform,
        p_start_date: start,
        p_end_date: end,
      }),
      supabase.from("platform_analytics_platforms").select("key, label").eq("key", platform).maybeSingle(),
    ])
    if (detailError) throw detailError
    if (platformError) throw platformError

    return NextResponse.json({ platform: platformRow ?? { key: platform, label: platform }, detail: detail ?? {} })
  } catch (error) {
    return handleServiceError(error)
  }
}
