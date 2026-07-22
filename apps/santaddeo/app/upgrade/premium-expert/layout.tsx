"use client"

import { HotelProvider } from "@/lib/contexts/hotel-context"
import { useEffect, useState } from "react"

interface LayoutData {
  selectedHotel: any
  allHotels: any[]
  isSuperAdmin: boolean
  isDeveloper: boolean
  isImpersonating: boolean
}

export default function PremiumExpertLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [data, setData] = useState<LayoutData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/ui/layout-data")
        if (res.ok) {
          const json = await res.json()
          setData({
            selectedHotel: json.selectedHotel || null,
            allHotels: json.allHotels || json.hotels || [],
            isSuperAdmin: json.isSuperAdmin || false,
            isDeveloper: json.isDeveloper || false,
            isImpersonating: json.isImpersonating || false,
          })
        }
      } catch (err) {
        console.error("[v0] Error loading layout data:", err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <HotelProvider initialData={data || undefined}>
      {children}
    </HotelProvider>
  )
}
