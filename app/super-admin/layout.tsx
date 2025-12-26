"use client"

import type React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Building2, Users, CreditCard, Settings, LogOut, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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
                  <span className="hidden sm:block text-sm">Super Admin</span>
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
                <DropdownMenuItem className="text-red-600">
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
