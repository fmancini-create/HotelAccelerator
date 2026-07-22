'use client'

import dynamic from 'next/dynamic'
import { HotelProvider } from '@/lib/contexts/hotel-context'
import { VatViewProvider } from '@/lib/contexts/vat-view-context'
import { AppFooter } from '@/components/layout/app-footer'
import { ReactNode } from 'react'

// Dynamic imports to prevent hydration mismatch with Radix UI components
const DashboardHeader = dynamic(
  () => import("@/components/dashboard/app-header").then((mod) => mod.DashboardHeader),
  { ssr: false, loading: () => <div className="h-16 border-b bg-white" /> },
)

const AiChatPanel = dynamic(
  () => import("@/components/dashboard/ai-chat-panel").then((mod) => mod.AiChatPanel),
  { ssr: false, loading: () => null },
)

interface AppLayoutProps {
  children: ReactNode
  initialData: {
    profile: any
    hotels: any[]
    selectedHotel: any
    pmsIntegration: any
    subscription: any
    isSuperAdmin: boolean
    isDeveloper: boolean
    isImpersonating: boolean
    roomTypes: any[]
    hasMappings: boolean
    etlStatus?: any
    capabilities?: any
    kpiConfigs?: any[]
    hasCustomThresholds?: boolean
    allHotels?: any[]
  }
}

export function AppLayout({ children, initialData }: AppLayoutProps) {
  // Provide defaults if initialData is undefined
  const safeData = initialData || {
    profile: null,
    hotels: [],
    selectedHotel: null,
    pmsIntegration: null,
    subscription: null,
    isSuperAdmin: false,
    isDeveloper: false,
    isImpersonating: false,
    hasMappings: false,
    allHotels: [],
  }

  const {
    profile,
    hotels,
    selectedHotel,
    pmsIntegration,
    subscription,
    isSuperAdmin,
    isDeveloper,
    isImpersonating,
    hasMappings,
    allHotels,
  } = safeData

  return (
    <HotelProvider
      initialData={{
        selectedHotel,
        allHotels: allHotels || hotels,
        isSuperAdmin,
        isDeveloper,
        isImpersonating,
      }}
    >
      <VatViewProvider>
      <div className="flex min-h-screen flex-col bg-gray-50">
        {/* Shared Header */}
        <DashboardHeader
          profile={profile}
          hotels={hotels}
          selectedHotel={selectedHotel}
          pmsIntegration={pmsIntegration}
          subscription={subscription}
          isSuperAdmin={isSuperAdmin}
          hasMappings={hasMappings}
          isImpersonatingUser={isImpersonating}
          allHotels={allHotels || hotels}
        />

        {/* Main Content */}
        <div className="flex-1 min-w-0 w-full overflow-x-hidden">
          {children}
        </div>

        {/* AI Chat Panel - visible when a hotel is selected */}
        {selectedHotel && (
          <AiChatPanel hotelId={selectedHotel.id} hotelName={selectedHotel.name} />
        )}

        {/* Footer */}
        <AppFooter />
      </div>
      </VatViewProvider>
    </HotelProvider>
  )
}
