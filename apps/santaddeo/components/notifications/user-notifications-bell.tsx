"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import Link from "next/link"
import { Bell, Check, CheckCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

interface UserNotification {
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
 * Bell icon showing personal notifications for the logged-in user
 * (e.g. OTA KPI reminders). Separate from the platform-wide
 * `NotificationsPopup` which shows release announcements.
 */
export function UserNotificationsBell() {
  const [open, setOpen] = useState(false)
  const { data, mutate } = useSWR<{ notifications: UserNotification[]; unreadCount: number }>(
    "/api/user-notifications",
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true },
  )

  const notifications = data?.notifications ?? []
  const unreadCount = data?.unreadCount ?? 0

  const markAllAsRead = useCallback(async () => {
    if (unreadCount === 0) return
    await fetch("/api/user-notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    })
    mutate()
  }, [unreadCount, mutate])

  const markOneAsRead = useCallback(
    async (id: string) => {
      await fetch("/api/user-notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      })
      mutate()
    },
    [mutate],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifiche">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 flex items-center justify-center text-[10px]"
              variant="destructive"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h3 className="font-semibold text-sm">Notifiche</h3>
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} non lette` : "Tutto letto"}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead}>
              <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
              Segna lette
            </Button>
          )}
        </div>
        <Separator />
        <div className="max-h-[420px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nessuna notifica
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onMarkRead={() => markOneAsRead(n.id)}
                  onClose={() => setOpen(false)}
                />
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function NotificationItem({
  notification,
  onMarkRead,
  onClose,
}: {
  notification: UserNotification
  onMarkRead: () => void
  onClose: () => void
}) {
  const createdAt = new Date(notification.created_at)
  const relative = formatRelative(createdAt)

  const body = (
    <div className="flex gap-3 items-start">
      <div
        className={cn(
          "mt-1.5 w-2 h-2 rounded-full flex-shrink-0",
          notification.is_read ? "bg-transparent" : "bg-primary",
        )}
      />
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm leading-snug",
            notification.is_read ? "text-muted-foreground" : "font-medium",
          )}
        >
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {notification.body}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground mt-1">{relative}</p>
      </div>
      {!notification.is_read && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onMarkRead()
          }}
          className="text-muted-foreground hover:text-foreground flex-shrink-0"
          aria-label="Segna come letta"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )

  if (notification.action_url) {
    return (
      <li>
        <Link
          href={notification.action_url}
          onClick={() => {
            onClose()
            if (!notification.is_read) onMarkRead()
          }}
          className="block px-4 py-3 hover:bg-muted/50 transition-colors"
        >
          {body}
        </Link>
      </li>
    )
  }

  return <li className="px-4 py-3">{body}</li>
}

function formatRelative(date: Date): string {
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "adesso"
  if (minutes < 60) return `${minutes} min fa`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h fa`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} g fa`
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "short" })
}
