"use client"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { UserCog, X } from "lucide-react"
import { useState } from "react"

interface ImpersonationBannerProps {
  hotelName: string
  organizationName?: string
}

export function ImpersonationBanner({ hotelName, organizationName }: ImpersonationBannerProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleStopImpersonation = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/superadmin/impersonate", {
        method: "DELETE",
      })

      if (!response.ok) throw new Error("Failed to stop impersonation")

      // Full page navigation to ensure the deleted cookie is picked up cleanly
      // router.push + router.refresh can race and cause a client-side exception
      window.location.href = "/superadmin"
    } catch (error) {
      console.error("Error stopping impersonation:", error)
      alert("Errore durante l'uscita dall'impersonazione")
      setIsLoading(false)
    }
  }

  return (
    <Alert className="rounded-none border-x-0 border-t-0 bg-purple-50 border-purple-200">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserCog className="h-5 w-5 text-purple-600" />
          <AlertDescription className="text-purple-900">
            <strong>Modalità Impersonazione:</strong> Stai visualizzando la dashboard come <strong>{hotelName}</strong>
            {organizationName && <span> ({organizationName})</span>} con tutti i privilegi di amministratore.
          </AlertDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleStopImpersonation}
          disabled={isLoading}
          className="border-purple-300 text-purple-700 hover:bg-purple-100 bg-transparent"
        >
          <X className="h-4 w-4 mr-2" />
          Esci da Impersonazione
        </Button>
      </div>
    </Alert>
  )
}
