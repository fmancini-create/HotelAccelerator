"use client"

import Link from "next/link"
import { Lock } from "lucide-react"
import AdminLoginForm from "@/components/admin-login-form"

export default function AdminLoginClient() {
  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-amber-700" />
            </div>
            <h1 className="text-2xl font-serif text-stone-800">HotelAccelerator</h1>
            <p className="text-stone-600 mt-2">Area Riservata</p>
          </div>

          <AdminLoginForm />

          <div className="mt-6 text-center">
            <Link href="/" className="text-sm text-amber-700 hover:underline">
              Torna al sito
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
