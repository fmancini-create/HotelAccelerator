"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { LayoutDashboard, Building2, Users, CreditCard, Settings, LogOut, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"
import { HotelAcceleratorMark } from "@/components/brand/hotel-accelerator-logo"

const navigation = [
  { name: "Dashboard", href: "/super-admin", icon: LayoutDashboard },
  { name: "Strutture", href: "/super-admin/structures", icon: Building2 },
  { name: "Collaboratori", href: "/super-admin/collaborators", icon: Users },
  { name: "Billing", href: "/super-admin/billing", icon: CreditCard },
]

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      // Skip auth check for login page
      if (pathname === "/super-admin/login") {
        setIsChecking(false)
        return
      }

      try {
        const supabase = createClient()

        // DEV BYPASS: auto-login UI consentito SOLO in sviluppo locale
        // (NODE_ENV=development su host localhost/127.0.0.1). Mai su preview
        // pubbliche o produzione (host raggiungibili da terzi).
        const hostname = typeof window !== "undefined" ? window.location.hostname : ""
        const isLocalDevHost =
          process.env.NODE_ENV === "development" && (hostname === "localhost" || hostname === "127.0.0.1")

        if (isLocalDevHost) {
          setUserEmail("dev@hotelaccelerator.local")
          setIsChecking(false)
          return
        }

        // Check if user is authenticated
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()

        if (authError || !user) {
          router.push("/admin")
          return
        }

        // Check if user is a platform collaborator
        const { data: collaborator, error: collaboratorError } = await supabase
          .from("platform_collaborators")
          .select("role, is_active, email")
          .eq("email", user.email)
          .maybeSingle()

        if (collaboratorError || !collaborator) {
          router.push("/admin")
          return
        }

        if (collaborator.role !== "super_admin" || !collaborator.is_active) {
          await supabase.auth.signOut()
          router.push("/admin")
          return
        }

        setUserEmail(collaborator.email)
        setIsChecking(false)
      } catch (error) {
        router.push("/admin")
      }
    }

    checkAuth()
  }, [pathname, router])

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push("/admin")
    } catch (error) {
      console.error("[v0] Logout error:", error)
    }
  }

  // Show login page without layout
  if (pathname === "/super-admin/login") {
    return <>{children}</>
  }

  // Show loading state while checking auth
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <span className="w-8 h-8 border-4 border-border border-t-foreground rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Verifica autenticazione...</p>
        </div>
      </div>
    )
  }

  const isActive = (href: string) => {
    if (href === "/super-admin") return pathname === "/super-admin"
    return pathname.startsWith(href)
  }

  return (
    /*
     * Light chrome, matching apps/santaddeo/app/superadmin/layout.tsx
     * (`bg-background`, `border-border bg-card`, destructive "Super Admin"
     * badge). This bar used to be `bg-neutral-900 text-white` - the single
     * biggest visual divergence from the reference.
     *
     * The dark background and every light-on-dark colour inside it are
     * converted in ONE change on purpose: dropping the dark surface first and
     * the text afterwards leaves dark-on-dark text in between, which is how
     * this exact conversion went wrong once before.
     *
     * The "danger zone" signal the dark bar carried is not lost - it moves to
     * the destructive ADMIN badge, as in the reference.
     */
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Navigation */}
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link href="/super-admin" className="flex items-center gap-2">
              <HotelAcceleratorMark className="h-8 w-8" priority />
              <span className="font-semibold text-foreground hidden sm:block">HotelAccelerator</span>
              <span className="text-xs bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded font-medium">
                ADMIN
              </span>
            </Link>

            {/* Main Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navigation.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive(item.href)
                        ? "bg-ha-brand-soft text-ha-brand-soft-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.name}
                  </Link>
                )
              })}
            </nav>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="text-foreground hover:bg-muted">
                  <div className="w-7 h-7 rounded-full bg-ha-brand text-ha-brand-foreground flex items-center justify-center mr-2">
                    <span className="text-xs font-medium">SA</span>
                  </div>
                  <span className="hidden sm:block text-sm">{userEmail}</span>
                  <ChevronDown className="w-4 h-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href="/super-admin/settings" className="flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Impostazioni
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden border-t border-border">
          <div className="flex overflow-x-auto">
            {navigation.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-3 text-sm whitespace-nowrap ${
                    isActive(item.href)
                      ? "text-ha-brand-soft-foreground border-b-2 border-ha-brand"
                      : "text-muted-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.name}
                </Link>
              )
            })}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  )
}
