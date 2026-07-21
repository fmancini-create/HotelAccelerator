"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getSupabaseClient } from "@/lib/supabase/client"
import { Home, Settings, Grid3X3, User, ChevronDown, LogOut } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

export function DatiActionButtons() {
  const router = useRouter()
  const [userName, setUserName] = useState<string>("Utente")

  useEffect(() => {
    async function loadProfile() {
      try {
        const supabase = getSupabaseClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", user.id)
          .single()

        if (profile) {
          const name = `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
          if (name) setUserName(name)
        }
      } catch {
        // Non-blocking
      }
    }
    loadProfile()
  }, [])

  const handleSignOut = async () => {
    const supabase = getSupabaseClient()
    await supabase.auth.signOut()
    window.location.href = "/auth/login"
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        className="gap-2"
        onClick={() => router.push("/dashboard")}
      >
        <Home className="h-4 w-4" />
        <span className="hidden sm:inline">Home</span>
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="gap-2 bg-transparent"
        onClick={() => { window.location.href = "/settings/hotel" }}
      >
        <Settings className="h-4 w-4" />
        <span className="hidden sm:inline">Impostazioni</span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 bg-transparent">
            <Grid3X3 className="h-4 w-4" />
            <span className="hidden sm:inline">Dati</span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Visualizza Dati</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/dati/bookings">Prenotazioni</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dati/production">Produzione</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dati/rooms-sold">Camere Vendute</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dati/reviews">Recensioni</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dati/performance-ota">Performance OTA</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dati/objectives">Obiettivi</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline max-w-[100px] truncate">{userName}</span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-[60]">
          <DropdownMenuLabel>Il mio Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Esci
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
