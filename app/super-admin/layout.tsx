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

        // Check if user is authenticated
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()

        if (authError || !user) {
          console.log("[v0] Not authenticated, redirecting to login")
          router.push("/super-admin/login")
          return
        }

        // Check if user is a platform collaborator
        const { data: collaborator, error: collaboratorError } = await supabase
          .from("platform_collaborators")
          .select("role, is_active, email")
          .eq("email", user.email)
          .maybeSingle()

        if (collaboratorError || !collaborator) {
          console.log("[v0] Not a platform collaborator")
          router.push("/super-admin/login")
          return
        }

        if (collaborator.role !== "super_admin" || !collaborator.is_active) {
          console.log("[v0] Not super admin or account suspended")
          await supabase.auth.signOut()
          router.push("/super-admin/login")
          return
        }

        setUserEmail(collaborator.email)
        setIsChecking(false)
      } catch (error) {
        console.error("[v0] Auth check error:", error)
        router.push("/super-admin/login")
      }
    }

    checkAuth()
  }, [pathname, router])

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push("/super-admin/login")
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
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="flex flex-col items-center gap-4">
          <span className="w-8 h-8 border-4 border-neutral-300 border-t-neutral-900 rounded-full animate-spin" />
          <p className="text-sm text-neutral-600">Verifica autenticazione...</p>
        </div>
      </div>
    )
  }

  const isActive = (href: string) => {
    if (href === "/super-admin") return pathname === "/super-admin"
    return pathname.startsWith(href)
  }

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50">
      {/* Top Navigation */}
      <header className="bg-neutral-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link href="/super-admin" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <span className="text-sm font-bold">HA</span>
              </div>
              <span className="font-semibold hidden sm:block">HotelAccelerator</span>
              <span className="text-xs bg-amber-500 text-neutral-900 px-1.5 py-0.5 rounded font-medium">ADMIN</span>
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
                        ? "bg-white/10 text-white"
                        : "text-neutral-400 hover:text-white hover:bg-white/5"
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
                <Button variant="ghost" className="text-neutral-300 hover:text-white hover:bg-white/10">
                  <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center mr-2">
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
        <div className="md:hidden border-t border-white/10">
          <div className="flex overflow-x-auto">
            {navigation.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-3 text-sm whitespace-nowrap ${
                    isActive(item.href) ? "text-white border-b-2 border-white" : "text-neutral-400"
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
