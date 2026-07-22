"use client"

// Mappa bulk-assign prospect per super-admin.
//
// Architettura:
// - Mappa Leaflet (OpenStreetMap) di tutta Italia, zoom iniziale 6.
// - I prospect vengono caricati FILTRATI per la bounding box visibile,
//   non in blocco: Supabase ha un max_rows=1000 sul gateway REST che
//   rendeva la prima query troncata ai primi 1000 per id (tutti Puglia/
//   Basilicata nei nostri import). Ad ogni moveend/zoomend ricarichiamo
//   la query con la nuova bbox, capped a 3000 per non saturare il browser.
// - Marker leggeri (CircleMarker): verde=libero, ambra=assegnato,
//   rosso=selezionato.
// - Tool di disegno (poligono + rettangolo) via leaflet-draw, agganciato
//   con useMap + L.Control.Draw (react-leaflet-draw non e' compatibile
//   con react-leaflet 5).
// - Al draw:created calcoliamo point-in-polygon con turf sui prospect
//   correntemente caricati e ritorniamo l'array di prospect_ids al parent.

import { useEffect, useMemo, useRef, useState } from "react"
import { MapContainer, TileLayer, CircleMarker, Tooltip, FeatureGroup, useMap, useMapEvents } from "react-leaflet"
import L from "leaflet"
import "leaflet-draw"
import booleanPointInPolygon from "@turf/boolean-point-in-polygon"
import { point as turfPoint, polygon as turfPolygon } from "@turf/helpers"
import useSWR from "swr"
import { Loader2, AlertTriangle } from "lucide-react"
import "leaflet/dist/leaflet.css"
import "leaflet-draw/dist/leaflet.draw.css"

type GeoProspect = {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  city: string | null
  province: string | null
  category: string | null
  stars: number | null
  assigned_agent_id: string | null
  status: string | null
}

type Bbox = { minLat: number; maxLat: number; minLng: number; maxLng: number }

const fetcher = (u: string) => fetch(u).then((r) => r.json())

interface Props {
  onlyUnassigned?: boolean
  onSelectionChange: (prospectIds: string[]) => void
  selectedIds: Set<string>
}

// Sotto-componente che aggiorna lo state bbox del parent ad ogni moveend.
// Deve stare dentro MapContainer perche' usa useMapEvents().
function BboxTracker({ onBboxChange }: { onBboxChange: (b: Bbox) => void }) {
  const map = useMap()

  // Snapshot iniziale (al mount)
  useEffect(() => {
    const b = map.getBounds()
    onBboxChange({
      minLat: b.getSouth(),
      maxLat: b.getNorth(),
      minLng: b.getWest(),
      maxLng: b.getEast(),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useMapEvents({
    moveend: () => {
      const b = map.getBounds()
      onBboxChange({
        minLat: b.getSouth(),
        maxLat: b.getNorth(),
        minLng: b.getWest(),
        maxLng: b.getEast(),
      })
    },
  })
  return null
}

// Sotto-componente che gestisce il control di disegno. Deve stare dentro
// MapContainer perche' usa useMap(). Si ri-monta quando l'array prospects
// cambia per assicurarsi che il PIP usi lo snapshot piu' recente.
function DrawControl({
  prospects,
  onSelectionChange,
}: {
  prospects: GeoProspect[]
  onSelectionChange: (ids: string[]) => void
}) {
  const map = useMap()
  const featureGroupRef = useRef<L.FeatureGroup | null>(null)

  useEffect(() => {
    const fg = new L.FeatureGroup()
    fg.addTo(map)
    featureGroupRef.current = fg

    const drawControl = new (L.Control as any).Draw({
      position: "topright",
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          drawError: { color: "#dc2626" },
          shapeOptions: { color: "#0ea5e9", weight: 2 },
        },
        rectangle: { shapeOptions: { color: "#0ea5e9", weight: 2 } },
        polyline: false,
        circle: false,
        marker: false,
        circlemarker: false,
      },
      edit: { featureGroup: fg, remove: true },
    })
    map.addControl(drawControl)

    const recompute = () => {
      const layers = fg.getLayers()
      if (layers.length === 0) {
        onSelectionChange([])
        return
      }
      const ids: string[] = []
      const polys = layers
        .map((layer: any) => {
          const gj = layer.toGeoJSON()
          if (gj.geometry?.type === "Polygon") {
            return turfPolygon(gj.geometry.coordinates)
          }
          return null
        })
        .filter(Boolean) as ReturnType<typeof turfPolygon>[]

      for (const p of prospects) {
        if (p.latitude == null || p.longitude == null) continue
        const pt = turfPoint([p.longitude, p.latitude])
        if (polys.some((poly) => booleanPointInPolygon(pt, poly))) {
          ids.push(p.id)
        }
      }
      onSelectionChange(ids)
    }

    const onCreated = (e: any) => {
      fg.addLayer(e.layer)
      recompute()
    }
    const onEdited = () => recompute()
    const onDeleted = () => recompute()

    map.on((L as any).Draw.Event.CREATED, onCreated)
    map.on((L as any).Draw.Event.EDITED, onEdited)
    map.on((L as any).Draw.Event.DELETED, onDeleted)

    return () => {
      map.off((L as any).Draw.Event.CREATED, onCreated)
      map.off((L as any).Draw.Event.EDITED, onEdited)
      map.off((L as any).Draw.Event.DELETED, onDeleted)
      map.removeControl(drawControl)
      map.removeLayer(fg)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospects.length])

  return null
}

export default function ProspectMapSelector({
  onlyUnassigned = false,
  onSelectionChange,
  selectedIds,
}: Props) {
  // bbox di partenza: Italia intera (poi viene aggiornato dal BboxTracker).
  const [bbox, setBbox] = useState<Bbox>({ minLat: 35, maxLat: 48, minLng: 6, maxLng: 19 })

  const url = useMemo(() => {
    const qs = new URLSearchParams({
      min_lat: bbox.minLat.toFixed(4),
      max_lat: bbox.maxLat.toFixed(4),
      min_lng: bbox.minLng.toFixed(4),
      max_lng: bbox.maxLng.toFixed(4),
    })
    if (onlyUnassigned) qs.set("only_unassigned", "1")
    return `/api/superadmin/prospects/geo-search?${qs.toString()}`
  }, [bbox, onlyUnassigned])

  const { data, isLoading, isValidating } = useSWR<{
    prospects: GeoProspect[]
    total: number
    truncated: boolean
  }>(url, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  })

  const prospects = useMemo(() => data?.prospects ?? [], [data])
  const total = data?.total ?? 0
  const truncated = data?.truncated ?? false

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-border overflow-hidden relative">
        {(isLoading || isValidating) && (
          <div className="absolute top-2 left-2 z-[1000] flex items-center gap-2 rounded-md bg-background/90 px-3 py-1.5 text-xs shadow-md border">
            <Loader2 className="h-3 w-3 animate-spin" />
            Caricamento prospect...
          </div>
        )}
        <MapContainer
          center={[42, 12] as [number, number]}
          zoom={6}
          style={{ height: "500px", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <BboxTracker onBboxChange={setBbox} />
          <FeatureGroup>
            {prospects.map((p) => {
              if (p.latitude == null || p.longitude == null) return null
              const isSelected = selectedIds.has(p.id)
              const isAssigned = !!p.assigned_agent_id
              return (
                <CircleMarker
                  key={p.id}
                  center={[p.latitude, p.longitude]}
                  radius={isSelected ? 6 : 3}
                  pathOptions={{
                    color: isSelected
                      ? "#dc2626"
                      : isAssigned
                        ? "#d97706"
                        : "#16a34a",
                    fillColor: isSelected
                      ? "#dc2626"
                      : isAssigned
                        ? "#d97706"
                        : "#16a34a",
                    fillOpacity: 0.8,
                    weight: isSelected ? 2 : 1,
                  }}
                >
                  <Tooltip>
                    <div className="text-xs">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-muted-foreground">
                        {p.city} ({p.province})
                      </div>
                      {isAssigned && (
                        <div className="text-amber-700">Gia&apos; assegnato</div>
                      )}
                    </div>
                  </Tooltip>
                </CircleMarker>
              )
            })}
          </FeatureGroup>
          <DrawControl prospects={prospects} onSelectionChange={onSelectionChange} />
        </MapContainer>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" />
          Disponibile
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-600" />
          Gia&apos; assegnato
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600" />
          Selezionato ({selectedIds.size})
        </span>
        <span className="ml-auto">
          {truncated ? (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              Mostrati {prospects.length} di {total.toLocaleString("it-IT")} prospect
              nell&apos;area. Zoomma per vederne di piu&apos;.
            </span>
          ) : (
            <>Mostrati {prospects.length} prospect nell&apos;area visibile</>
          )}
        </span>
      </div>
    </div>
  )
}
