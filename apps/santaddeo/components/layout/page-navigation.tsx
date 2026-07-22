"use client"

import { Button } from "@/components/ui/button"
import { ArrowLeft, Home } from "lucide-react"
import { useRouter } from "next/navigation"

interface PageNavigationProps {
  showBack?: boolean
  showHome?: boolean
  homeUrl?: string
  className?: string
}

export function PageNavigation({
  showBack = true,
  showHome = true,
  homeUrl = "/dashboard",
  className = "",
}: PageNavigationProps) {
  const router = useRouter()

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showBack && (
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Indietro
        </Button>
      )}
      {showHome && (
        <Button variant="ghost" size="sm" onClick={() => router.push(homeUrl)} className="gap-2">
          <Home className="h-4 w-4" />
          Home
        </Button>
      )}
    </div>
  )
}
