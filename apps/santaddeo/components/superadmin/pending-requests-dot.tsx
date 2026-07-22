"use client"

import useSWR from "swr"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

/**
 * Conteggio richieste di assegnazione struttura in sospeso (polling 60s).
 * Usato per mostrare un pallino di notifica sull'accesso al SuperAdmin.
 */
export function usePendingAssignmentRequests() {
  const { data } = useSWR<{ counts?: Record<string, number> }>(
    "/api/superadmin/prospects/assignment-requests?status=pending",
    fetcher,
    { refreshInterval: 60_000 },
  )
  return data?.counts?.pending ?? 0
}

/**
 * Pallino di notifica: appare solo se c'e' almeno una richiesta da evadere.
 * `variant="badge"` mostra anche il numero (per i contesti con piu' spazio,
 * es. il pulsante mobile); altrimenti un semplice pallino.
 */
export function PendingRequestsDot({
  className,
  variant = "dot",
}: {
  className?: string
  variant?: "dot" | "badge"
}) {
  const pending = usePendingAssignmentRequests()
  if (pending <= 0) return null

  const label = `${pending} richieste di assegnazione in sospeso`

  if (variant === "badge") {
    return (
      <span
        role="status"
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-none text-white",
          className,
        )}
      >
        {pending > 99 ? "99+" : pending}
      </span>
    )
  }

  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={cn(
        "absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-background",
        className,
      )}
    />
  )
}
