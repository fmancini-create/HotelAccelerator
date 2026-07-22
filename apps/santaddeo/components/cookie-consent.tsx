"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { X } from "lucide-react"

export function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    // Check if user has already made a choice
    const consent = localStorage.getItem("cookie-consent")
    if (!consent) {
      setShowBanner(true)
    } else if (consent === "accepted") {
      // If consent was given, enable Google Analytics
      enableGoogleAnalytics()
    }
  }, [])

  const enableGoogleAnalytics = () => {
    if (typeof window !== "undefined" && (window as any).gtag) {
      ;(window as any).gtag("consent", "update", {
        ad_storage: "granted",
        analytics_storage: "granted",
        ad_user_data: "granted",
        ad_personalization: "granted",
      })
    }
  }

  const handleAccept = () => {
    localStorage.setItem("cookie-consent", "accepted")
    enableGoogleAnalytics()
    setShowBanner(false)
  }

  const handleReject = () => {
    localStorage.setItem("cookie-consent", "rejected")
    // Deny consent for analytics
    if (typeof window !== "undefined" && (window as any).gtag) {
      ;(window as any).gtag("consent", "update", {
        ad_storage: "denied",
        analytics_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      })
    }
    setShowBanner(false)
  }

  if (!showBanner) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6 animate-in slide-in-from-bottom">
      <Card className="mx-auto max-w-4xl bg-white shadow-lg border-2">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-2">Questo sito utilizza i cookie</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Utilizziamo i cookie per analizzare il traffico del sito e ottimizzare la tua esperienza. I tuoi dati
                personali verranno condivisi con Google solo se accetti. Puoi modificare le tue preferenze in qualsiasi
                momento.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={handleAccept} size="sm">
                  Accetta tutti i cookie
                </Button>
                <Button onClick={handleReject} variant="outline" size="sm">
                  Rifiuta
                </Button>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="shrink-0" onClick={handleReject}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
