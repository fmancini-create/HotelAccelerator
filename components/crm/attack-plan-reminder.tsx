"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowRight, CheckCircle2, Target } from "lucide-react"
import { Button } from "@/components/ui/button"

type PlanAction = { id: string; text: string; done: boolean }
type Today = { day_number: number; actions: PlanAction[]; status: "open" | "done" | "skipped" }

export function AttackPlanReminder() {
  const [today, setToday] = useState<Today | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/crm/attack-plan", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled) setToday(body?.today ?? null)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const remaining = useMemo(() => today?.actions.filter((action) => !action.done).length ?? 0, [today])
  if (!today) return null

  if (today.status === "done" || remaining === 0) {
    return (
      <div className="border-b bg-muted/30 px-4 py-2 sm:px-6">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            <span>Giorno {today.day_number}: piano di oggi completato.</span>
          </div>
          <Button asChild size="sm" variant="ghost"><Link href="/admin/crm/attack-plan">Apri piano</Link></Button>
        </div>
      </div>
    )
  }

  return (
    <div className="border-b bg-muted/30 px-4 py-2 sm:px-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Target className="h-4 w-4" />
          <span>Piano 30gg · Giorno {today.day_number}: {remaining} {remaining === 1 ? "azione" : "azioni"} da fare oggi</span>
        </div>
        <Button asChild size="sm">
          <Link href="/admin/crm/attack-plan">Fai il piano di oggi <ArrowRight className="ml-2 h-4 w-4" /></Link>
        </Button>
      </div>
    </div>
  )
}
