// KPI Calculation Utilities

import type { KPIMetrics } from "@/lib/types/database"

/**
 * Calculate RevPOR (Revenue Per Occupied Room)
 */
export function calculateRevPOR(totalRevenue: number, occupiedRooms: number): number {
  if (occupiedRooms === 0) return 0
  return Number((totalRevenue / occupiedRooms).toFixed(2))
}

/**
 * Calculate RevPAR (Revenue Per Available Room)
 */
export function calculateRevPAR(totalRevenue: number, availableRooms: number): number {
  if (availableRooms === 0) return 0
  return Number((totalRevenue / availableRooms).toFixed(2))
}

/**
 * Calculate Occupancy Rate
 */
export function calculateOccupancyRate(occupiedRooms: number, availableRooms: number): number {
  if (availableRooms === 0) return 0
  return Number(((occupiedRooms / availableRooms) * 100).toFixed(2))
}

/**
 * Calculate Out of Service Rate
 */
export function calculateOutOfServiceRate(outOfServiceRooms: number, totalRooms: number): number {
  if (totalRooms === 0) return 0
  return Number(((outOfServiceRooms / totalRooms) * 100).toFixed(2))
}

/**
 * Calculate Cancellation Rate (% of bookings)
 */
export function calculateCancellationRate(cancellations: number, bookings: number): number {
  if (bookings === 0) return 0
  return Number(((cancellations / bookings) * 100).toFixed(2))
}

/**
 * Calculate ADR (Average Daily Rate)
 */
export function calculateADR(totalRevenue: number, roomNights: number): number {
  if (roomNights === 0) return 0
  return Number((totalRevenue / roomNights).toFixed(2))
}

/**
 * Calculate Revenue Coefficient (RevPOR / RevPAR)
 */
export function calculateRevenueCoefficient(revpor: number, revpar: number): number {
  if (revpar === 0) return 0
  return Number((revpor / revpar).toFixed(2))
}

/**
 * Calculate all KPIs for a given day
 */
export function calculateAllKPIs(data: {
  totalRevenue: number
  occupiedRooms: number
  availableRooms: number
  totalRooms: number
  outOfServiceRooms: number
  roomNights: number
  bookings: number
  cancellations: number
}): KPIMetrics {
  const revpor = calculateRevPOR(data.totalRevenue, data.occupiedRooms)
  const revpar = calculateRevPAR(data.totalRevenue, data.availableRooms)
  const occupancy_rate = calculateOccupancyRate(data.occupiedRooms, data.availableRooms)
  const adr = calculateADR(data.totalRevenue, data.roomNights)
  const cancellation_rate = calculateCancellationRate(data.cancellations, data.bookings)

  return {
    revpor,
    revpar,
    occupancy_rate,
    adr,
    cancellation_rate,
  }
}

/**
 * Calculate percentage change between two values
 */
export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Number((((current - previous) / previous) * 100).toFixed(2))
}

/**
 * Calculate pickup time in days
 */
export function calculatePickupDays(eventDate: Date, referenceDate: Date): number {
  const diffTime = eventDate.getTime() - referenceDate.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

/**
 * Format currency value
 */
export function formatCurrency(value: number, currency = "EUR"): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: currency,
  }).format(value)
}

/**
 * Format percentage value
 */
export function formatPercentage(value: number): string {
  return `${value.toFixed(2)}%`
}
