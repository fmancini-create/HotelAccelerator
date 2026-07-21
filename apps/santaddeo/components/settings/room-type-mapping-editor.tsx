"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Save, RefreshCw, CheckCircle2, AlertCircle, Link2 } from "lucide-react"

interface RoomTypeFromAvailability {
  room_type_id: string
  room_type_name: string | null
}

interface RoomType {
  id: string
  name: string
  scidoo_room_type_id: string | null
  total_rooms: number
}

interface PmsRmsMapping {
  id: string
  pms_provider: string
  pms_entity_type: string
  pms_code: string
  pms_label: string | null
  rms_code: string
  rms_label: string | null
  hotel_id: string | null
}

// RMS Canonical Room Type Codes
const RMS_ROOM_TYPE_CODES = [
  { code: "SGL", label: "Single Room (Singola)" },
  { code: "DBL", label: "Double Room (Doppia)" },
  { code: "TWN", label: "Twin Room (Twin)" },
  { code: "TRP", label: "Triple Room (Tripla)" },
  { code: "QUD", label: "Quad Room (Quadrupla)" },
  { code: "STE", label: "Suite" },
  { code: "JST", label: "Junior Suite" },
  { code: "FAM", label: "Family Room (Familiare)" },
  { code: "APT", label: "Apartment (Appartamento)" },
  { code: "VIL", label: "Villa" },
  { code: "DLX", label: "Deluxe Room" },
  { code: "SUP", label: "Superior Room" },
  { code: "STD", label: "Standard Room" },
  { code: "ECO", label: "Economy Room" },
]

interface Props {
  hotelId: string
  hotelName: string
  pmsProvider: string
  existingMappings: PmsRmsMapping[]
  existingRoomTypes: RoomType[]
}

export function RoomTypeMappingEditor({ hotelId, hotelName, pmsProvider, existingMappings, existingRoomTypes }: Props) {
  const [pmsRoomTypes, setPmsRoomTypes] = useState<RoomTypeFromAvailability[]>([])
  const [mappings, setMappings] = useState<Record<string, string>>({}) // pms_code -> rms_code
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Load PMS room types from availability data
  useEffect(() => {
    async function loadPmsRoomTypes() {
      setIsLoading(true)
      setError(null)
      
      try {
        const response = await fetch(`/api/settings/room-types/from-availability?hotelId=${hotelId}`)
        const data = await response.json()
        
        if (!response.ok) {
          throw new Error(data.error || "Errore nel caricamento")
        }
        
        setPmsRoomTypes(data.roomTypes || [])
        
        // Initialize mappings from existing mappings
        const initialMappings: Record<string, string> = {}
        existingMappings
          .filter(m => m.pms_entity_type === "room_type" && m.hotel_id === hotelId)
          .forEach(m => {
            initialMappings[m.pms_code] = m.rms_code
          })
        
        // Also check room_types table for scidoo_room_type_id mappings
        existingRoomTypes.forEach(rt => {
          if (rt.scidoo_room_type_id && !initialMappings[rt.scidoo_room_type_id]) {
            // Map to the closest RMS code based on name
            const nameMatch = RMS_ROOM_TYPE_CODES.find(r => 
              rt.name.toLowerCase().includes(r.label.toLowerCase().split(" ")[0].toLowerCase())
            )
            if (nameMatch) {
              initialMappings[rt.scidoo_room_type_id] = nameMatch.code
            }
          }
        })
        
        setMappings(initialMappings)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore nel caricamento")
      } finally {
        setIsLoading(false)
      }
    }
    
    loadPmsRoomTypes()
  }, [hotelId, existingMappings, existingRoomTypes])

  const handleMappingChange = (pmsCode: string, rmsCode: string) => {
    setMappings(prev => ({
      ...prev,
      [pmsCode]: rmsCode
    }))
    setSuccess(null)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    setSuccess(null)
    
    try {
      const response = await fetch("/api/settings/room-types/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          pmsProvider,
          mappings: Object.entries(mappings).map(([pmsCode, rmsCode]) => {
            const pmsRoomType = pmsRoomTypes.find(rt => rt.room_type_id === pmsCode)
            return {
              pms_code: pmsCode,
              pms_label: pmsRoomType?.room_type_name || pmsCode,
              rms_code: rmsCode,
              rms_label: RMS_ROOM_TYPE_CODES.find(r => r.code === rmsCode)?.label || rmsCode
            }
          })
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || "Errore nel salvataggio")
      }
      
      setSuccess(`Salvate ${data.saved} mappature con successo`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio")
    } finally {
      setIsSaving(false)
    }
  }

  const unmappedCount = pmsRoomTypes.filter(rt => !mappings[rt.room_type_id]).length
  const mappedCount = pmsRoomTypes.filter(rt => mappings[rt.room_type_id]).length

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span>Caricamento tipologie camera...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (pmsRoomTypes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Mappatura Tipologie Camera
          </CardTitle>
          <CardDescription>Collega le tipologie camera del PMS ai codici RMS standard</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Nessuna tipologia trovata</AlertTitle>
            <AlertDescription>
              Non sono state trovate tipologie camera nei dati di disponibilita'. 
              Assicurati che i dati siano stati sincronizzati correttamente dal PMS.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Mappatura Tipologie Camera
            </CardTitle>
            <CardDescription>
              Collega le tipologie camera del PMS ({pmsProvider}) ai codici RMS standard per {hotelName}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={unmappedCount > 0 ? "destructive" : "default"}>
              {mappedCount}/{pmsRoomTypes.length} mappate
            </Badge>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Salvataggio...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Salva Mappature
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Errore</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {success && (
          <Alert className="mb-4 border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">Successo</AlertTitle>
            <AlertDescription className="text-green-700">{success}</AlertDescription>
          </Alert>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Tipologia PMS</TableHead>
              <TableHead className="w-[40%]">Codice RMS Standard</TableHead>
              <TableHead className="w-[20%]">Stato</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pmsRoomTypes.map((pmsRt) => (
              <TableRow key={pmsRt.room_type_id}>
                <TableCell>
                  <div>
                    <span className="font-medium">{pmsRt.room_type_name || "Senza nome"}</span>
                    <span className="block text-xs text-muted-foreground font-mono">
                      ID: {pmsRt.room_type_id.substring(0, 8)}...
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Select
                    value={mappings[pmsRt.room_type_id] || ""}
                    onValueChange={(value) => handleMappingChange(pmsRt.room_type_id, value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleziona codice RMS..." />
                    </SelectTrigger>
                    <SelectContent>
                      {RMS_ROOM_TYPE_CODES.map((rmsCode) => (
                        <SelectItem key={rmsCode.code} value={rmsCode.code}>
                          <span className="font-mono">{rmsCode.code}</span>
                          <span className="ml-2 text-muted-foreground">{rmsCode.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {mappings[pmsRt.room_type_id] ? (
                    <Badge variant="outline" className="gap-1 text-green-600 border-green-300">
                      <CheckCircle2 className="h-3 w-3" />
                      Mappata
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">
                      <AlertCircle className="h-3 w-3" />
                      Da mappare
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
