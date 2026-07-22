"use client"

interface DeveloperNavProps {
  userEmail: string
  userRole: string
  hotels?: any[]
  selectedHotel?: any
  pmsIntegration?: any
}

export function DeveloperNav({ userEmail, userRole, hotels = [], selectedHotel, pmsIntegration }: DeveloperNavProps) {
  return null
  // </CHANGE>
}
