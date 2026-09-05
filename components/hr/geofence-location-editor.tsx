"use client"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react"
import { Loader2, MapPin, Minus, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  MAX_GEOFENCE_RADIUS_M,
  MAX_MAP_ZOOM,
  MIN_GEOFENCE_RADIUS_M,
  MIN_MAP_ZOOM,
  TILE_SIZE,
  clamp,
  clampGeofenceRadius,
  formatRadius,
  latLngToWorldPixel,
  metersPerPixel,
  osmTileUrl,
  worldPixelToLatLng,
  zoomForRadius,
  type LatLng,
} from "@/lib/hr/geofence-map"

export type HrGeofenceSettings = {
  location_name: string
  latitude: string
  longitude: string
  geofence_radius_m: string
  require_geolocation: boolean
  allow_outside_geofence: boolean
}

type GeocodingResult = {
  id: string
  label: string
  latitude: number
  longitude: number
}

type Props = {
  settings: HrGeofenceSettings
  busy: boolean
  onChange: (settings: HrGeofenceSettings) => void
  onSave: () => void
}

type MapSize = { width: number; height: number }
type DragState = {
  pointerId: number
  x: number
  y: number
  centerX: number
  centerY: number
  moved: boolean
}

const RADIUS_PRESETS = [100, 300, 500, 1000, 3000, 5000]

function parseCenter(settings: HrGeofenceSettings): LatLng | null {
  const latitude = Number(settings.latitude)
  const longitude = Number(settings.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  return { latitude, longitude }
}

function GeofenceMap({
  center,
  radiusMeters,
  onCenterChange,
}: {
  center: LatLng
  radiusMeters: number
  onCenterChange: (center: LatLng) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [size, setSize] = useState<MapSize>({ width: 640, height: 360 })
  const [dragging, setDragging] = useState(false)
  const [zoom, setZoom] = useState(() => zoomForRadius(center.latitude, radiusMeters))

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const update = () => {
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height })
      }
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const targetPixels = Math.max(70, Math.min(size.width, size.height) * 0.32)
    setZoom(zoomForRadius(center.latitude, radiusMeters, targetPixels))
    // Re-fit only when the radius or viewport changes. Dragging the map must not
    // override a zoom level chosen manually by the administrator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusMeters, size.width, size.height])

  const viewport = useMemo(() => {
    const centerPixel = latLngToWorldPixel(center.latitude, center.longitude, zoom)
    const left = centerPixel.x - size.width / 2
    const top = centerPixel.y - size.height / 2
    const firstX = Math.floor(left / TILE_SIZE)
    const lastX = Math.floor((left + size.width) / TILE_SIZE)
    const firstY = Math.floor(top / TILE_SIZE)
    const lastY = Math.floor((top + size.height) / TILE_SIZE)
    const tiles: Array<{ key: string; url: string; left: number; top: number }> = []

    for (let tileY = firstY; tileY <= lastY; tileY += 1) {
      for (let tileX = firstX; tileX <= lastX; tileX += 1) {
        const url = osmTileUrl(zoom, tileX, tileY)
        if (!url) continue
        tiles.push({
          key: `${zoom}:${tileX}:${tileY}`,
          url,
          left: tileX * TILE_SIZE - left,
          top: tileY * TILE_SIZE - top,
        })
      }
    }

    return { centerPixel, tiles }
  }, [center.latitude, center.longitude, size.height, size.width, zoom])

  const radiusPixels = radiusMeters / metersPerPixel(center.latitude, zoom)

  function moveByPixels(deltaX: number, deltaY: number) {
    const world = latLngToWorldPixel(center.latitude, center.longitude, zoom)
    onCenterChange(worldPixelToLatLng(world.x + deltaX, world.y + deltaY, zoom))
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    const world = latLngToWorldPixel(center.latitude, center.longitude, zoom)
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      centerX: world.x,
      centerY: world.y,
      moved: false,
    }
    setDragging(true)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const deltaX = event.clientX - drag.x
    const deltaY = event.clientY - drag.y
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) drag.moved = true
    onCenterChange(worldPixelToLatLng(drag.centerX - deltaX, drag.centerY - deltaY, zoom))
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.moved) {
      const rect = event.currentTarget.getBoundingClientRect()
      const world = latLngToWorldPixel(center.latitude, center.longitude, zoom)
      const offsetX = event.clientX - (rect.left + rect.width / 2)
      const offsetY = event.clientY - (rect.top + rect.height / 2)
      onCenterChange(worldPixelToLatLng(world.x + offsetX, world.y + offsetY, zoom))
    }
    dragRef.current = null
    setDragging(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function onWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault()
    setZoom((current) => clamp(current + (event.deltaY < 0 ? 1 : -1), MIN_MAP_ZOOM, MAX_MAP_ZOOM))
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const pixels = event.shiftKey ? 120 : 40
    if (event.key === "ArrowLeft") moveByPixels(-pixels, 0)
    else if (event.key === "ArrowRight") moveByPixels(pixels, 0)
    else if (event.key === "ArrowUp") moveByPixels(0, -pixels)
    else if (event.key === "ArrowDown") moveByPixels(0, pixels)
    else if (event.key === "+" || event.key === "=") {
      setZoom((current) => clamp(current + 1, MIN_MAP_ZOOM, MAX_MAP_ZOOM))
    } else if (event.key === "-") {
      setZoom((current) => clamp(current - 1, MIN_MAP_ZOOM, MAX_MAP_ZOOM))
    } else return
    event.preventDefault()
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        role="application"
        tabIndex={0}
        aria-label="Mappa per scegliere il punto centrale della timbratura"
        className={`relative h-[360px] w-full touch-none overflow-hidden rounded-lg border bg-muted outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null
          setDragging(false)
        }}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      >
        {viewport.tiles.map((tile) => (
          <div
            key={tile.key}
            aria-hidden
            className="pointer-events-none absolute bg-cover bg-center"
            style={{
              left: tile.left,
              top: tile.top,
              width: TILE_SIZE,
              height: TILE_SIZE,
              backgroundImage: `url(${tile.url})`,
            }}
          />
        ))}

        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 rounded-full border-2 border-primary bg-primary/10"
          style={{
            width: Math.max(8, radiusPixels * 2),
            height: Math.max(8, radiusPixels * 2),
            transform: "translate(-50%, -50%)",
          }}
        />
        <MapPin
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-9 w-9 -translate-x-1/2 -translate-y-full fill-background text-primary drop-shadow"
        />

        <div className="absolute right-3 top-3 z-20 flex flex-col gap-1">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            aria-label="Aumenta zoom"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setZoom((current) => clamp(current + 1, MIN_MAP_ZOOM, MAX_MAP_ZOOM))}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            aria-label="Riduci zoom"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setZoom((current) => clamp(current - 1, MIN_MAP_ZOOM, MAX_MAP_ZOOM))}
          >
            <Minus className="h-4 w-4" />
          </Button>
        </div>

        <div className="absolute bottom-1 right-2 z-20 rounded bg-background/85 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          © <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Trascina la mappa oppure clicca sul punto esatto: il segnaposto al centro è la posizione di riferimento. Il cerchio mostra il raggio reale di copertura.
      </p>
    </div>
  )
}

export function HrGeofenceLocationCard({ settings, busy, onChange, onSave }: Props) {
  const [searching, setSearching] = useState(false)
  const [searchMessage, setSearchMessage] = useState("")
  const [results, setResults] = useState<GeocodingResult[]>([])
  const center = parseCenter(settings)
  const radius = clampGeofenceRadius(Number(settings.geofence_radius_m || 200))

  function selectResult(result: GeocodingResult) {
    onChange({
      ...settings,
      location_name: result.label,
      latitude: result.latitude.toFixed(7),
      longitude: result.longitude.toFixed(7),
    })
    setSearchMessage("Indirizzo trovato. Ora centra il segnaposto sul punto esatto.")
  }

  async function searchAddress() {
    const query = settings.location_name.trim()
    if (query.length < 3) {
      setSearchMessage("Inserisci un indirizzo più completo.")
      return
    }

    setSearching(true)
    setSearchMessage("")
    try {
      const response = await fetch(`/api/admin/hr/geocode?q=${encodeURIComponent(query)}`, { cache: "no-store" })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || "Ricerca indirizzo non riuscita")
      const found = Array.isArray(body.results) ? (body.results as GeocodingResult[]) : []
      setResults(found)
      if (!found.length) {
        setSearchMessage("Nessun indirizzo trovato. Prova ad aggiungere comune, provincia o CAP.")
        return
      }
      selectResult(found[0])
    } catch {
      setSearchMessage("Non riesco a cercare l'indirizzo in questo momento. Riprova tra poco.")
    } finally {
      setSearching(false)
    }
  }

  function setRadius(value: number) {
    onChange({ ...settings, geofence_radius_m: String(clampGeofenceRadius(value)) })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sede e timbratura geolocalizzata</CardTitle>
        <CardDescription>
          Cerca l'indirizzo, centra sulla mappa il punto esatto e scegli il raggio entro cui la timbratura è considerata in sede.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="hr-geofence-address" className="text-sm font-medium">Indirizzo della sede</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="hr-geofence-address"
              placeholder="Es. Via Sorripa 10, San Casciano in Val di Pesa"
              value={settings.location_name}
              onChange={(event) => onChange({ ...settings, location_name: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  void searchAddress()
                }
              }}
            />
            <Button type="button" variant="outline" disabled={searching || settings.location_name.trim().length < 3} onClick={() => void searchAddress()}>
              {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Cerca
            </Button>
          </div>
          {searchMessage && <p className="text-xs text-muted-foreground">{searchMessage}</p>}
          {results.length > 1 && (
            <div className="space-y-1 rounded-lg border p-2" aria-label="Indirizzi alternativi">
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Altri risultati</p>
              {results.slice(1).map((result) => (
                <button
                  key={result.id}
                  type="button"
                  className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => selectResult(result)}
                >
                  {result.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {center ? (
          <GeofenceMap
            center={center}
            radiusMeters={radius}
            onCenterChange={(nextCenter) => onChange({
              ...settings,
              latitude: nextCenter.latitude.toFixed(7),
              longitude: nextCenter.longitude.toFixed(7),
            })}
          />
        ) : (
          <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Cerca un indirizzo per visualizzare la mappa e scegliere il punto esatto.
          </div>
        )}

        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Raggio di copertura</div>
              <div className="text-2xl font-semibold tabular-nums">{formatRadius(radius)}</div>
            </div>
            <div className="w-36">
              <label htmlFor="hr-geofence-radius" className="text-xs text-muted-foreground">Metri</label>
              <Input
                id="hr-geofence-radius"
                type="number"
                min={MIN_GEOFENCE_RADIUS_M}
                max={MAX_GEOFENCE_RADIUS_M}
                step="25"
                value={settings.geofence_radius_m}
                onChange={(event) => onChange({ ...settings, geofence_radius_m: event.target.value })}
                onBlur={() => setRadius(Number(settings.geofence_radius_m || MIN_GEOFENCE_RADIUS_M))}
              />
            </div>
          </div>
          <input
            aria-label="Raggio di copertura in metri"
            className="w-full accent-primary"
            type="range"
            min={MIN_GEOFENCE_RADIUS_M}
            max={MAX_GEOFENCE_RADIUS_M}
            step="25"
            value={radius}
            onChange={(event) => setRadius(Number(event.target.value))}
          />
          <div className="flex flex-wrap gap-2">
            {RADIUS_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={radius === preset ? "default" : "outline"}
                onClick={() => setRadius(preset)}
              >
                {formatRadius(preset)}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Puoi usare raggi molto diversi per strutture diverse: ad esempio 300 m per una villa e 3 km per un grande stabilimento o campus.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.require_geolocation}
              onChange={(event) => onChange({ ...settings, require_geolocation: event.target.checked })}
            />
            Posizione obbligatoria
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.allow_outside_geofence}
              onChange={(event) => onChange({ ...settings, allow_outside_geofence: event.target.checked })}
            />
            Consenti fuori sede con anomalia
          </label>
        </div>

        <Button
          type="button"
          disabled={busy || !center || settings.location_name.trim().length < 3}
          onClick={onSave}
        >
          Salva sede e raggio
        </Button>
      </CardContent>
    </Card>
  )
}
