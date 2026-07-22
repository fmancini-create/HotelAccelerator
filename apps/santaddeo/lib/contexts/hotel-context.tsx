'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'

interface Hotel {
  id: string
  name: string
  organization_id?: string
  [key: string]: any
}

interface HotelContextType {
  selectedHotel: Hotel | null
  setSelectedHotel: (hotel: Hotel) => void
  allHotels: Hotel[]
  setAllHotels: (hotels: Hotel[]) => void
  isSuperAdmin: boolean
  isDeveloper: boolean
  isImpersonating: boolean
}

const HotelContext = createContext<HotelContextType | undefined>(undefined)

export function HotelProvider({
  children,
  initialData,
}: {
  children: React.ReactNode
  initialData?: {
    selectedHotel: Hotel | null
    allHotels: Hotel[]
    isSuperAdmin: boolean
    isDeveloper: boolean
    isImpersonating: boolean
  }
}) {
  // Safe defaults if initialData is undefined
  const safeInitialData = initialData || {
    selectedHotel: null,
    allHotels: [],
    isSuperAdmin: false,
    isDeveloper: false,
    isImpersonating: false,
  }

  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(safeInitialData.selectedHotel)
  const [allHotels, setAllHotels] = useState<Hotel[]>(safeInitialData.allHotels || [])

  const handleSetSelectedHotel = useCallback((hotel: Hotel) => {
    setSelectedHotel(hotel)
    // Update cookie for server-side access
    document.cookie = `impersonated_hotel_id=${hotel.id}; path=/; max-age=31536000`
  }, [])

  return (
    <HotelContext.Provider
      value={{
        selectedHotel,
        setSelectedHotel: handleSetSelectedHotel,
        allHotels,
        setAllHotels,
        isSuperAdmin: safeInitialData.isSuperAdmin,
        isDeveloper: safeInitialData.isDeveloper,
        isImpersonating: safeInitialData.isImpersonating,
      }}
    >
      {children}
    </HotelContext.Provider>
  )
}

export function useHotel() {
  const context = useContext(HotelContext)
  if (context === undefined) {
    throw new Error('useHotel must be used within a HotelProvider')
  }
  return context
}
