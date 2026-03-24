"use client"

import { useEffect } from "react"

export default function AdminPage() {
  useEffect(() => {
    const hostname = window.location.hostname
    const isDevOrPreview =
      hostname.includes("vercel.run") ||
      hostname.includes("localhost") ||
      hostname.includes("127.0.0.1") ||
      hostname.includes("vusercontent.net")

    // Always redirect to dashboard - in dev skip login, in prod the dashboard will handle auth
    window.location.replace("/admin/dashboard")
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
    </div>
  )
}


