"use client"

import { useEffect, useState } from "react"
import { Zap } from "lucide-react"

export function QuickLoginButtons() {
  const [isDev, setIsDev] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname.toLowerCase()
      // SECURITY: vercel.app is PRODUCTION, never show dev buttons there
      const isProd = hostname.includes("vercel.app")
      const isDevEnv = (
        hostname.includes("vusercontent.net") ||
        hostname === "localhost" ||
        hostname.startsWith("127.")
      ) && !isProd
      setIsDev(isDevEnv)
    }
  }, [])

  if (!isDev) return null

  return (
    <div className="mt-8 pt-6 border-t border-border space-y-2">
      <p className="text-xs text-muted-foreground text-center font-semibold mb-3">
        Dev Bypass (no auth needed)
      </p>
      
      <button
        type="button"
        onClick={() => {
          // In sandbox, middleware + dashboard-content bypass auth entirely.
          // No Supabase login needed - just navigate to dashboard.
          window.location.href = "/dashboard"
        }}
        className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md transition-colors inline-flex items-center justify-center gap-2"
      >
        <Zap className="h-3 w-3" />
        Vai alla Dashboard (Dev User)
      </button>
    </div>
  )
}
