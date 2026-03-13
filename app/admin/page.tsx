"use client"

import { useEffect } from "react"
import AdminLoginClient from "@/components/admin-login-client"

export default function AdminPage() {
  useEffect(() => {
    // Check if we're in dev/preview and redirect to users page
    const hostname = typeof window !== "undefined" ? window.location.hostname : ""
    const isDevOrPreview = hostname.includes("vercel.run") || 
                           hostname.includes("localhost") || 
                           hostname.includes("127.0.0.1")

    if (isDevOrPreview) {
      // Use replace to avoid creating history entries
      window.location.replace("/admin/users")
    }
  }, [])

  // In production or while checking, show login
  return <AdminLoginClient />
}


