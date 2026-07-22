"use client"

import { useState } from "react"
import useSWR from "swr"
import { Bell, Check, CheckCheck, ChevronRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  action_url: string | null
  is_read: boolean
  created_at: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/**
 * Campanella di notifiche per i venditori e per i super_admin.
 *
 * - Polling ogni 60s del badge unread.
 * - Click apre dropdown con ultime 30 notifiche.
 * - Click su una riga: marca come letta + naviga su action_url se presente.
 * - "Segna tutte come lette" in fondo.
 *
 * Si poggia su /api/user-notifications (GET / PATCH).
 */
export function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  // FIX 13/06/2026: gli alert con body lungo ("Siamo troppo vuoti", "Avviso
  // camere basse") risultavano spezzati/illeggibili perche' il body era
  // troncato (line-clamp-2) finche' non si cliccava per espandere. Ora il
  // body completo e' SEMPRE visibile e il pulsante "Apri" e' sempre mostrato
  // quando esiste una destinazione: niente piu' espansione al click.
  const { data, mutate, isLoading } = useSWR<{
    notifications: Notification[]
    unreadCount: number
  }>("/api/user-notifications", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  })

  const notifications = data?.notifications ?? []
  const unread = data?.unreadCount ?? 0

  async function markRead(ids: string[]) {
    if (ids.length === 0) return
    await fetch("/api/user-notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
    mutate()
  }

  async function markAllRead() {
    await fetch("/api/user-notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    })
    mutate()
  }

  function handleClick(n: Notification) {
    // Il body completo e' sempre visibile (niente piu' clamp/espansione):
    // il click sulla riga si limita a marcare la notifica come letta.
    // Per andare alla destinazione c'e' il pulsante "Apri".
    if (!n.is_read) markRead([n.id])
  }

  function handleOpenAction(e: React.MouseEvent, n: Notification) {
    e.stopPropagation()
    if (!n.action_url) return
    if (!n.is_read) markRead([n.id])
    setOpen(false)
    window.location.href = n.action_url
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative", className)}
          aria-label={`Notifiche${unread > 0 ? ` (${unread} non lette)` : ""}`}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] leading-none flex items-center justify-center rounded-full"
            >
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Notifiche</span>
            {unread > 0 && (
              <Badge variant="secondary" className="text-xs">
                {unread} non {unread === 1 ? "letta" : "lette"}
              </Badge>
            )}
          </div>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={markAllRead}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Segna tutte come lette
            </Button>
          )}
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm">Caricamento...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                Nessuna notifica per ora
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => {
                return (
                  <li key={n.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleClick(n)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          handleClick(n)
                        }
                      }}
                      className={cn(
                        "w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex gap-3 cursor-pointer",
                        !n.is_read && "bg-emerald-50/40",
                      )}
                    >
                      <div className="flex-shrink-0 mt-1">
                        <span
                          className={cn(
                            "block h-2 w-2 rounded-full",
                            n.is_read ? "bg-muted-foreground/30" : "bg-emerald-500",
                          )}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              "text-sm leading-tight",
                              !n.is_read ? "font-medium text-foreground" : "text-muted-foreground",
                            )}
                          >
                            {n.title}
                          </p>
                          <time
                            className="text-[11px] text-muted-foreground whitespace-nowrap"
                            dateTime={n.created_at}
                          >
                            {formatRelative(n.created_at)}
                          </time>
                        </div>
                        {n.body && (
                          <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words leading-relaxed">
                            {n.body}
                          </p>
                        )}
                        {n.action_url && (
                          <button
                            type="button"
                            onClick={(e) => handleOpenAction(e, n)}
                            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            Apri
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      {!n.is_read && (
                        <span
                          role="button"
                          title="Segna come letta"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation()
                            markRead([n.id])
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation()
                              e.preventDefault()
                              markRead([n.id])
                            }
                          }}
                          className="flex-shrink-0 self-start mt-0.5 p-1 rounded hover:bg-background"
                        >
                          <Check className="h-3.5 w-3.5 text-muted-foreground" />
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function formatRelative(iso: string): string {
  const now = Date.now()
  const t = new Date(iso).getTime()
  const diff = Math.max(0, now - t)
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "ora"
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}g`
  const date = new Date(iso)
  return date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })
}
