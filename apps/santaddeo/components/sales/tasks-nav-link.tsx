"use client"

import useSWR from "swr"
import Link from "next/link"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

type TasksData = {
  counters?: { today: number; overdue: number; total_pending: number }
}

/**
 * Link "Da fare" in nav con badge dinamico: numero verde se ci sono task
 * pending in giornata, numero rosso se c'e' anche almeno un task scaduto.
 * Il counter e' aggiornato ogni 60s e on focus.
 */
export function TasksNavLink({ className }: { className?: string }) {
  const { data } = useSWR<TasksData>(
    "/api/sales/tasks?range=today&status=pending&limit=1",
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true },
  )
  // Per gli scaduti faccio una query separata (range=overdue) per non
  // doverci pensare lato server: la prima query e' "oggi" e basta.
  const { data: overdueData } = useSWR<TasksData>(
    "/api/sales/tasks?range=overdue&status=pending&limit=1",
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true },
  )

  const today = data?.counters?.today ?? 0
  const overdue = overdueData?.counters?.overdue ?? 0
  const hasOverdue = overdue > 0
  const showBadge = today + overdue > 0
  const badgeValue = overdue || today

  return (
    <Link
      href="/sales/tasks"
      className={className ?? "px-3 py-2 rounded-md hover:bg-muted inline-flex items-center gap-2"}
    >
      Da fare
      {showBadge && (
        <span
          className={
            hasOverdue
              ? "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-red-600 text-white"
              : "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white"
          }
          title={
            hasOverdue
              ? `${overdue} scaduti, ${today} oggi`
              : `${today} oggi`
          }
        >
          {badgeValue}
        </span>
      )}
    </Link>
  )
}
