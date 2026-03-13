"use client"

import { useEffect } from "react"

export default function AdminPage() {
  useEffect(() => {
    const hostname = window.location.hostname
    const isDevOrPreview = hostname.includes("vercel.run") || hostname.includes("localhost")
    
    if (isDevOrPreview) {
      window.location.replace("/admin/users")
    }
  }, [])

  return null
}


