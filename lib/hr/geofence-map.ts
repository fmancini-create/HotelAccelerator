export const WEB_MERCATOR_MAX_LAT = 85.05112878
export const MIN_GEOFENCE_RADIUS_M = 25
export const MAX_GEOFENCE_RADIUS_M = 5000
export const MIN_MAP_ZOOM = 2
export const MAX_MAP_ZOOM = 19
export const TILE_SIZE = 256

export type LatLng = { latitude: number; longitude: number }
export type WorldPixel = { x: number; y: number }

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function normalizeLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180
}

export function clampLatitude(latitude: number) {
  return clamp(latitude, -WEB_MERCATOR_MAX_LAT, WEB_MERCATOR_MAX_LAT)
}

export function latLngToWorldPixel(
  latitude: number,
  longitude: number,
  zoom: number,
): WorldPixel {
  const lat = clampLatitude(latitude)
  const lng = normalizeLongitude(longitude)
  const scale = TILE_SIZE * 2 ** zoom
  const sinLatitude = Math.sin((lat * Math.PI) / 180)

  return {
    x: ((lng + 180) / 360) * scale,
    y:
      (0.5 -
        Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) *
      scale,
  }
}

export function worldPixelToLatLng(x: number, y: number, zoom: number): LatLng {
  const scale = TILE_SIZE * 2 ** zoom
  const wrappedX = ((x % scale) + scale) % scale
  const clampedY = clamp(y, 0, scale)
  const longitude = (wrappedX / scale) * 360 - 180
  const mercatorY = 0.5 - clampedY / scale
  const latitude =
    (90 - (360 * Math.atan(Math.exp(-mercatorY * 2 * Math.PI))) / Math.PI)

  return {
    latitude: clampLatitude(latitude),
    longitude: normalizeLongitude(longitude),
  }
}

export function metersPerPixel(latitude: number, zoom: number) {
  const latitudeRadians = (clampLatitude(latitude) * Math.PI) / 180
  return (156543.03392 * Math.cos(latitudeRadians)) / 2 ** zoom
}

export function zoomForRadius(
  latitude: number,
  radiusMeters: number,
  targetRadiusPixels = 110,
) {
  const safeRadius = clamp(radiusMeters, MIN_GEOFENCE_RADIUS_M, MAX_GEOFENCE_RADIUS_M)
  const safePixels = Math.max(40, targetRadiusPixels)
  const latitudeRadians = (clampLatitude(latitude) * Math.PI) / 180
  const numerator = 156543.03392 * Math.cos(latitudeRadians) * safePixels
  const calculated = Math.log2(numerator / safeRadius)
  return clamp(Math.round(calculated), MIN_MAP_ZOOM, MAX_MAP_ZOOM)
}

export function clampGeofenceRadius(radiusMeters: number) {
  if (!Number.isFinite(radiusMeters)) return MIN_GEOFENCE_RADIUS_M
  return clamp(Math.round(radiusMeters), MIN_GEOFENCE_RADIUS_M, MAX_GEOFENCE_RADIUS_M)
}

export function formatRadius(radiusMeters: number) {
  const radius = clampGeofenceRadius(radiusMeters)
  if (radius < 1000) return `${radius} m`
  const kilometres = radius / 1000
  const decimals = Number.isInteger(kilometres) ? 0 : kilometres < 2 ? 2 : 1
  return `${kilometres.toLocaleString("it-IT", { maximumFractionDigits: decimals })} km`
}

export function osmTileUrl(zoom: number, tileX: number, tileY: number) {
  const tilesPerAxis = 2 ** zoom
  const wrappedX = ((tileX % tilesPerAxis) + tilesPerAxis) % tilesPerAxis
  if (tileY < 0 || tileY >= tilesPerAxis) return null
  return `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`
}
