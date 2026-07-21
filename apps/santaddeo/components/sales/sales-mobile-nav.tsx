"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import useSWR from "swr"
import {
  LayoutDashboard,
  Building2,
  KanbanSquare,
  CalendarDays,
  Menu,
  ListChecks,
  Inbox,
  Mail,
  Wallet,
  TrendingUp,
  Users,
  BarChart3,
  BookOpen,
  GraduationCap,
  LogOut,
  ArrowLeft,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

type ExitMode = "superadmin" | "hotel" | "logout"

type MobileNavProps = {
  isAreaManager?: boolean
  exitMode: ExitMode
  fullName: string
}

/**
 * Navigazione mobile per l'area venditori.
 *
 * - Tab bar fissa in basso (visibile solo < md) con le 4 sezioni piu' usate
 *   sul campo + voce "Altro" che apre uno Sheet con tutte le sezioni
 *   secondarie e il pulsante di uscita role-aware.
 * - Su desktop (>= md) e' nascosta: resta la nav orizzontale del layout.
 */
export function SalesMobileNav({ isAreaManager, exitMode, fullName }: MobileNavProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Badge "Da fare" (stessa logica di TasksNavLink, semplificata)
  const { data: todayData } = useSWR<{ counters?: { today: number } }>(
    "/api/sales/tasks?range=today&status=pending&limit=1",
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true },
  )
  const { data: overdueData } = useSWR<{ counters?: { overdue: number } }>(
    "/api/sales/tasks?range=overdue&status=pending&limit=1",
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: true },
  )
  const today = todayData?.counters?.today ?? 0
  const overdue = overdueData?.counters?.overdue ?? 0
  const taskBadge = overdue || today
  const taskBadgeColor = overdue > 0 ? "bg-red-600" : "bg-emerald-600"

  const isActive = (href: string) =>
    href === "/sales" ? pathname === "/sales" : pathname.startsWith(href)

  const primary = [
    { href: "/sales", label: "Home", icon: LayoutDashboard },
    { href: "/sales/prospects", label: "Prospect", icon: Building2 },
    { href: "/sales/pipeline", label: "Pipeline", icon: KanbanSquare },
    { href: "/sales/calendar", label: "Agenda", icon: CalendarDays },
  ]

  const secondary = [
    { href: "/sales/tasks", label: "Da fare", icon: ListChecks, badge: taskBadge },
    { href: "/sales/leads", label: "Lead", icon: Inbox },
    { href: "/sales/posta", label: "Posta", icon: Mail },
    { href: "/sales/commissions", label: "Commissioni", icon: Wallet },
    { href: "/sales/revman", label: "RevMan", icon: TrendingUp },
    ...(isAreaManager ? [{ href: "/sales/team", label: "Team", icon: Users }] : []),
    { href: "/sales/stats", label: "Statistiche", icon: BarChart3 },
    { href: "/sales/playbook", label: "Disco Vendita", icon: GraduationCap },
    { href: "/sales/glossary", label: "Glossario", icon: BookOpen },
  ]

  return (
    <>
      {/* Spacer per non far finire il contenuto sotto la tab bar */}
      <div className="h-16 md:hidden" aria-hidden="true" />

      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
        aria-label="Navigazione venditori"
      >
        <div className="grid grid-cols-5 h-16">
          {primary.map(({ href, label, icon: Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
                <span>{label}</span>
              </Link>
            )
          })}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                aria-label="Altre sezioni"
              >
                <Menu className="h-5 w-5" />
                <span>Altro</span>
                {taskBadge > 0 && (
                  <span
                    className={cn(
                      "absolute top-2 right-[calc(50%-1.25rem)] min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center",
                      taskBadgeColor,
                    )}
                  >
                    {taskBadge}
                  </span>
                )}
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85vw] max-w-sm p-0 flex flex-col">
              <SheetHeader className="px-4 py-4 border-b border-border text-left">
                <SheetTitle className="text-base">{fullName}</SheetTitle>
                <p className="text-xs text-muted-foreground">CRM Venditori</p>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto py-2">
                {secondary.map(({ href, label, icon: Icon, badge }) => {
                  const active = isActive(href)
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 text-sm transition-colors",
                        active
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="flex-1">{label}</span>
                      {typeof badge === "number" && badge > 0 && (
                        <span
                          className={cn(
                            "min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold text-white inline-flex items-center justify-center",
                            taskBadgeColor,
                          )}
                        >
                          {badge}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>

              <div className="border-t border-border p-4">
                {exitMode === "superadmin" ? (
                  <Link
                    href="/superadmin"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-md border border-border text-sm hover:bg-muted"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Torna a Superadmin
                  </Link>
                ) : exitMode === "hotel" ? (
                  <Link
                    href="/dashboard"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-md border border-border text-sm hover:bg-muted"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Torna a hotel
                  </Link>
                ) : (
                  <a
                    href="/api/auth/logout-now"
                    className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-md border border-border text-sm hover:bg-muted"
                  >
                    <LogOut className="h-4 w-4" />
                    Esci
                  </a>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  )
}
