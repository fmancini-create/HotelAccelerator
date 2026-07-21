"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Bell, ChevronDown, Building2, Settings, Home, Gauge, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Image from "next/image"


interface AdminHeaderProps {
  openAlertsCount: number
  hotels: any[]
}

export function AdminHeader({ openAlertsCount, hotels }: AdminHeaderProps) {
  const router = useRouter()
  const [selectedHotel, setSelectedHotel] = useState<string | null>(null)

  const handleImpersonate = (hotelId: string) => {
    setSelectedHotel(hotelId)
    router.push(`/dashboard?hotel_id=${hotelId}`)
  }

  return (
    <div className="sticky top-0 z-50 border-b bg-white shadow-sm">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Navigation + Logo */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Indietro
              </Button>
              <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")} className="gap-2">
                <Home className="h-4 w-4" />
                Dashboard
              </Button>
            </div>

            <div className="h-8 w-px bg-gray-200" />

            <Link href="/admin/dashboard" className="flex items-center gap-3">
              <img src="/logo-santaddeo.png" alt="SANTADDEO" width={120} height={36} />
              <Badge variant="secondary" className="text-xs">
                SuperAdmin
              </Badge>
            </Link>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4">
            {/* Impersonate Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Building2 className="h-4 w-4 mr-2" />
                  Modalità SuperAdmin
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Impersona Struttura</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hotels.slice(0, 10).map((hotel) => (
                  <DropdownMenuItem key={hotel.id} onClick={() => handleImpersonate(hotel.id)}>
                    <Building2 className="h-4 w-4 mr-2" />
                    {hotel.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Link Rapidi</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link href="/superadmin">
                    <Home className="h-4 w-4 mr-2" />
                    SuperAdmin Home
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings/pms">
                    <Settings className="h-4 w-4 mr-2" />
                    Gestione Connettori
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/admin/performance">
                    <Gauge className="h-4 w-4 mr-2" />
                    Performance Monitor
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Alerts Bell */}
            <Button variant="outline" size="icon" className="relative bg-transparent" asChild>
              <Link href="#alerts">
                <Bell className="h-5 w-5" />
                {openAlertsCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                  >
                    {openAlertsCount}
                  </Badge>
                )}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
