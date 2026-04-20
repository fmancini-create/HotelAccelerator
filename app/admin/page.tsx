"use client"

import { useEffect } from "react"

export default function AdminPage() {
  useEffect(() => {
    window.location.replace("/admin/dashboard")
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
    </div>
  )
}


