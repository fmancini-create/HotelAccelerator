"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Eye, X } from "lucide-react"
import { Button } from "@/components/ui/button"

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`))
  return match ? decodeURIComponent(match[2]) : null
}

export function ImpersonationBanner() {
  const router = useRouter()
  const [propertyName, setPropertyName] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    const name = getCookie("x-impersonate-property-name")
    setPropertyName(name)
  }, [])

  const handleStop = async () => {
    setStopping(true)
    try {
      await fetch("/api/super-admin/impersonate", { method: "DELETE" })
      setPropertyName(null)
      router.push("/super-admin/structures")
      router.refresh()
    } catch {
      setStopping(false)
    }
  }

  if (!propertyName) return null

  return (
    <div className="bg-amber-500 text-neutral-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-10">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Eye className="w-4 h-4" />
            <span>Impersonazione attiva:</span>
            <span className="font-bold">{propertyName}</span>
            <span className="opacity-75">- Stai visualizzando come tenant</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleStop}
            disabled={stopping}
            className="text-neutral-900 hover:bg-amber-600 hover:text-neutral-900 h-7 px-2"
          >
            <X className="w-4 h-4 mr-1" />
            {stopping ? "Uscita..." : "Esci"}
          </Button>
        </div>
      </div>
    </div>
  )
}
