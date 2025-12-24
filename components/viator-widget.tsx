"use client"

import { useEffect } from "react"
import { useLanguage } from "@/lib/language-context"

const VIATOR_WIDGETS = {
  it: "W-1fed6c35-2447-4332-8057-f8a97df22401",
  en: "W-edcf3361-5c61-4ec4-ad87-a15fa2c5e210",
  fr: "W-4d4ad71e-3974-4bf2-8b3f-0f501625a89f",
  de: "W-b3b324c7-5e01-4b27-925f-8a8d21b6383b",
  nl: "W-cfcc943f-31a2-4ff8-9fb7-d79f7d19daa7",
}

const PARTNER_ID = "P00229636"

export function ViatorWidget() {
  const { language } = useLanguage()

  useEffect(() => {
    // Load Viator script once
    if (!document.querySelector('script[src="https://www.viator.com/orion/partner/widget.js"]')) {
      const script = document.createElement("script")
      script.src = "https://www.viator.com/orion/partner/widget.js"
      script.async = true
      document.body.appendChild(script)
    }
  }, [])

  useEffect(() => {
    // Re-initialize widget when language changes
    if (typeof window !== "undefined" && (window as any).viatorWidget) {
      ;(window as any).viatorWidget.init()
    }
  }, [language])

  return (
    <div className="w-full">
      {/* Viator Widget Container */}
      <div className="min-h-[600px] bg-muted/20 rounded-lg p-4">
        <div
          data-vi-partner-id={PARTNER_ID}
          data-vi-widget-ref={VIATOR_WIDGETS[language as keyof typeof VIATOR_WIDGETS]}
        />
      </div>
    </div>
  )
}

export default ViatorWidget
