"use client"

import { useState, useEffect, useCallback } from "react"
import { Bell, X, Megaphone, Sparkles, Rocket } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"

interface Notification {
  id: string
  type: "release" | "coming_soon" | "announcement"
  title: string
  body: string
  created_at: string
  feature_title?: string | null
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  release: { label: "Rilascio", icon: Rocket, color: "bg-green-100 text-green-700 border-green-200" },
  coming_soon: { label: "In arrivo", icon: Sparkles, color: "bg-blue-100 text-blue-700 border-blue-200" },
  announcement: { label: "Novita", icon: Megaphone, color: "bg-amber-100 text-amber-700 border-amber-200" },
}

export function NotificationsPopup() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications")
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications || [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const handleDismiss = async (notificationId: string) => {
    // Optimistic update
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId))
    try {
      await fetch("/api/notifications/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      })
    } catch {
      // Revert on error
      fetchNotifications()
    }
  }

  const handleDismissAll = async () => {
    const ids = notifications.map((n) => n.id)
    setNotifications([])
    for (const id of ids) {
      fetch("/api/notifications/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: id }),
      }).catch(() => {})
    }
  }

  const unreadCount = notifications.length

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffHours < 1) return "Pochi minuti fa"
    if (diffHours < 24) return `${diffHours}h fa`
    if (diffDays < 7) return `${diffDays}g fa`
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })
  }

  // Don't render anything if no notifications and not loading
  if (!loading && unreadCount === 0) {
    return (
      <Button variant="ghost" size="icon" className="relative h-9 w-9 text-muted-foreground" disabled>
        <Bell className="h-4 w-4" />
        <span className="sr-only">Nessuna notifica</span>
      </Button>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
          <span className="sr-only">{unreadCount} notifiche</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[380px] p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Notifiche</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{unreadCount}</Badge>
            )}
          </div>
          {unreadCount > 1 && (
            <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={handleDismissAll}>
              Chiudi tutte
            </Button>
          )}
        </div>

        {/* Notifications list */}
        <div className="max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-30" />
              <span className="text-sm">Nessuna notifica</span>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notif) => {
                const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.announcement
                const Icon = config.icon
                return (
                  <div key={notif.id} className="px-4 py-3 hover:bg-accent/30 transition-colors group relative">
                    <div className="flex gap-3">
                      <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center border ${config.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground leading-tight">{notif.title}</p>
                            {notif.feature_title && (
                              <span className="text-[10px] text-muted-foreground">{notif.feature_title}</span>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDismiss(notif.id)
                            }}
                          >
                            <X className="h-3 w-3" />
                            <span className="sr-only">Chiudi</span>
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap break-words">
                          {notif.body}
                        </p>
                        <span className="text-[10px] text-muted-foreground/60 mt-1 block">
                          {formatDate(notif.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
