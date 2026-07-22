"use client"

import useSWR from "swr"
import Link from "next/link"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

type DemoRequest = { id: string; status: string }
type DemoData = { requests?: DemoRequest[] }

/**
 * Link "Calendario" in nav con badge del numero di richieste demo/call in
 * attesa di conferma (status=pending) per il venditore loggato. Comprende le
 * call prenotate dai lead dalla pagina pubblica. Aggiornato ogni 60s e on focus.
 */
export function CalendarNavLink({ className }: { className?: string }) {
  const { data } = useSWR<DemoData>("/api/sales/demo-requests", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  })

  const pending = (data?.requests ?? []).filter((r) => r.status === "pending").length

  return (
    <Link
      href="/sales/calendar"
      className={className ?? "px-3 py-2 rounded-md hover:bg-muted inline-flex items-center gap-2"}
    >
      Calendario
      {pending > 0 && (
        <span
          className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-amber-500 text-white"
          title={`${pending} call/demo da confermare`}
        >
          {pending}
        </span>
      )}
    </Link>
  )
}
