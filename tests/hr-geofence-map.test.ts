import { describe, expect, it } from "vitest"
import {
  MAX_GEOFENCE_RADIUS_M,
  MIN_GEOFENCE_RADIUS_M,
  clampGeofenceRadius,
  formatRadius,
  latLngToWorldPixel,
  metersPerPixel,
  worldPixelToLatLng,
  zoomForRadius,
} from "@/lib/hr/geofence-map"

describe("HR geofence map geometry", () => {
  it("keeps latitude/longitude stable through Web Mercator conversion", () => {
    const original = { latitude: 43.6277, longitude: 11.1844 }
    const world = latLngToWorldPixel(original.latitude, original.longitude, 16)
    const roundTrip = worldPixelToLatLng(world.x, world.y, 16)

    expect(roundTrip.latitude).toBeCloseTo(original.latitude, 6)
    expect(roundTrip.longitude).toBeCloseTo(original.longitude, 6)
  })

  it("supports both a 300 metre hotel radius and a 3 kilometre campus radius", () => {
    const hotelZoom = zoomForRadius(43.62, 300, 110)
    const campusZoom = zoomForRadius(44.50, 3000, 110)

    expect(hotelZoom).toBeGreaterThan(campusZoom)
    expect(300 / metersPerPixel(43.62, hotelZoom)).toBeGreaterThan(50)
    expect(3000 / metersPerPixel(44.50, campusZoom)).toBeGreaterThan(50)
    expect(formatRadius(300)).toBe("300 m")
    expect(formatRadius(3000)).toBe("3 km")
  })

  it("enforces the backend-compatible 25m to 5km radius bounds", () => {
    expect(clampGeofenceRadius(1)).toBe(MIN_GEOFENCE_RADIUS_M)
    expect(clampGeofenceRadius(99999)).toBe(MAX_GEOFENCE_RADIUS_M)
    expect(clampGeofenceRadius(300)).toBe(300)
    expect(clampGeofenceRadius(3000)).toBe(3000)
  })
})
