import { NextRequest, NextResponse } from "next/server"

import { getAuthenticatedUserEmail } from "@/lib/auth-property"
import { handleServiceError } from "@/lib/errors"
import { SuperAdminService } from "@/lib/platform-services"
import { createServiceClient } from "@/lib/supabase/server"

const DATE = /^\d{4}-\d{2}-\d{2}$/

async function requireSuperAdmin(request: NextRequest) {
  const email = await getAuthenticatedUserEmail(request)
  await new SuperAdminService().verifySuperAdmin(email)
}

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request)
    const customStart = request.nextUrl.searchParams.get("start")
    const customEnd = request.nextUrl.searchParams.get("end")

    if ((customStart && !DATE.test(customStart)) || (customEnd && !DATE.test(customEnd))) {
      return NextResponse.json({ error: "Intervallo non valido" }, { status: 400 })
    }
    if ((customStart && !customEnd) || (!customStart && customEnd)) {
      return NextResponse.json({ error: "Per l'intervallo personalizzato servono entrambe le date" }, { status: 400 })
    }
    if (customStart && customEnd && customStart > customEnd) {
      return NextResponse.json({ error: "La data iniziale non puo superare quella finale" }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc("get_suite_analytics_overview", {
      p_custom_start: customStart || null,
      p_custom_end: customEnd || null,
    })
    if (error) throw error

    return NextResponse.json({ items: data ?? [] })
  } catch (error) {
    return handleServiceError(error)
  }
}
