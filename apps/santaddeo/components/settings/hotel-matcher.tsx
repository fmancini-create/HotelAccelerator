"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Search, MapPin, Star, Check, ExternalLink } from "lucide-react"
import { toast } from "sonner"

interface PlaceResult {
  place_id: string
  name: string
  formatted_address: string
  rating?: number
  user_ratings_total?: number
  photos?: string[]
}

interface HotelMatcherProps {
  hotelId: string
  hotelName: string
  hotelAddress?: string
  googleApiKey: string
  onConnected: () => void
}

export function HotelMatcher({ hotelId, hotelName, hotelAddress, googleApiKey, onConnected }: HotelMatcherProps) {
  const [searchName, setSearchName] = useState(hotelName)
  const [searchAddress, setSearchAddress] = useState(hotelAddress || "")
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<PlaceResult[]>([])
  const [connecting, setConnecting] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!searchName.trim()) {
      toast.error("Inserisci il nome dell'hotel")
      return
    }

    setSearching(true)
    try {
      const response = await fetch("/api/integrations/reviews/search-hotel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          hotelName: searchName,
          address: searchAddress,
          googleApiKey,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Errore nella ricerca")
      }

      setResults(data.results || [])

      if (data.results.length === 0) {
        toast.info("Nessun risultato trovato. Prova a modificare la ricerca.")
      } else {
        toast.success(`Trovati ${data.results.length} risultati`)
      }
    } catch (error: any) {
      console.error("[v0] Error searching hotel:", error)
      toast.error(error.message || "Errore nella ricerca dell'hotel")
    } finally {
      setSearching(false)
    }
  }

  const handleConnect = async (place: PlaceResult) => {
    setConnecting(place.place_id)
    try {
      const response = await fetch("/api/integrations/reviews/connect-hotel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          placeId: place.place_id,
          placeName: place.name,
          placeAddress: place.formatted_address,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Errore nel collegamento")
      }

      toast.success("Hotel collegato con successo!")
      onConnected()
    } catch (error: any) {
      console.error("[v0] Error connecting hotel:", error)
      toast.error(error.message || "Errore nel collegamento dell'hotel")
    } finally {
      setConnecting(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="search-name">Nome Hotel</Label>
          <Input
            id="search-name"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder="Es: Hotel Bella Vista"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="search-address">Indirizzo (opzionale)</Label>
          <Input
            id="search-address"
            value={searchAddress}
            onChange={(e) => setSearchAddress(e.target.value)}
            placeholder="Es: Via Roma 123, Milano"
          />
        </div>

        <Button onClick={handleSearch} disabled={searching || !searchName.trim()} className="w-full">
          {searching ? (
            <>
              <Spinner className="mr-2 h-4 w-4" />
              Ricerca in corso...
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" />
              Cerca su Google Maps
            </>
          )}
        </Button>
      </div>

      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Risultati trovati</h3>
            <Badge variant="secondary">{results.length}</Badge>
          </div>

          <div className="space-y-3">
            {results.map((place) => (
              <Card key={place.place_id} className="p-4">
                <div className="flex gap-4">
                  {place.photos && place.photos[0] && (
                    <img
                      src={place.photos[0] || "/placeholder.svg"}
                      alt={place.name}
                      className="h-24 w-24 rounded-lg object-cover"
                    />
                  )}

                  <div className="flex-1 space-y-2">
                    <div>
                      <h4 className="font-medium">{place.name}</h4>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {place.formatted_address}
                      </div>
                    </div>

                    {place.rating && (
                      <div className="flex items-center gap-2 text-sm">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="font-medium">{place.rating}</span>
                        {place.user_ratings_total && (
                          <span className="text-muted-foreground">({place.user_ratings_total} recensioni)</span>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleConnect(place)} disabled={connecting !== null}>
                        {connecting === place.place_id ? (
                          <>
                            <Spinner className="mr-2 h-3 w-3" />
                            Collegamento...
                          </>
                        ) : (
                          <>
                            <Check className="mr-2 h-3 w-3" />
                            Collega questo hotel
                          </>
                        )}
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          window.open(`https://www.google.com/maps/place/?q=place_id:${place.place_id}`, "_blank")
                        }
                      >
                        <ExternalLink className="mr-2 h-3 w-3" />
                        Vedi su Maps
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
