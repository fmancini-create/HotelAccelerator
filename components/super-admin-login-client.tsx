"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Shield } from "lucide-react"
import SuperAdminLoginForm from "@/components/super-admin-login-form"

export default function SuperAdminLoginClient() {
  // DEV/PREVIEW BYPASS: Auto-redirect in development/preview environments
  useEffect(() => {
    const hostname = window.location.hostname
    const isDevOrPreview = hostname.includes("vercel.run") || 
                           hostname.includes("localhost") || 
                           hostname.includes("127.0.0.1")
    
    if (isDevOrPreview) {
      console.log("[v0] DEV/PREVIEW MODE: Auto-redirecting to super-admin dashboard")
      window.location.href = "/super-admin"
    }
  }, [])

  return (
    <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-neutral-800 rounded-lg shadow-2xl p-8 border border-neutral-700">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-amber-500" />
            </div>
            <h1 className="text-2xl font-bold text-white">HotelAccelerator</h1>
            <p className="text-neutral-400 mt-2">Super Admin Platform</p>
          </div>

          <SuperAdminLoginForm />

          <div className="mt-6 text-center">
            <Link href="/" className="text-sm text-neutral-400 hover:text-white transition-colors">
              Torna alla home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
