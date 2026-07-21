"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { Save, RefreshCw, CheckCircle2, AlertCircle, Link2, FileSpreadsheet, Loader2 } from "lucide-react"

interface SheetTab {
  title: string
  headers: string[]
  sampleRows: string[][]
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

interface RoomType {
  id: string
  name: string
  scidoo_room_type_id: string | null
  total_rooms: number
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
  spreadsheetId: string | null
  existingMappings: PmsRmsMapping[]
  existingRoomTypes: RoomType[]
}

export function GDocsRoomTypeMappingEditor({ 
  hotelId, 
  hotelName, 
  pmsProvider, 
  spreadsheetId,
  existingMappings, 
  existingRoomTypes 
}: Props) {
  const [discoveredTabs, setDiscoveredTabs] = useState<SheetTab[]>([])
  const [selectedTab, setSelectedTab] = useState<string>("")
  const [roomTypesColumn, setRoomTypesColumn] = useState<string>("")
  const [roomTypesFromSheet, setRoomTypesFromSheet] = useState<string[]>([])
  const [mappings, setMappings] = useState<Record<string, string>>({}) // pms_code -> rms_code
  const [isLoading, setIsLoading] = useState(false)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Discover sheets when component mounts
  useEffect(() => {
    if (spreadsheetId) {
      discoverSheets()
    }
  }, [spreadsheetId])

  // Initialize mappings from existing data
  useEffect(() => {
    const initialMappings: Record<string, string> = {}
    existingMappings
      .filter(m => m.pms_entity_type === "room_type" && m.hotel_id === hotelId)
      .forEach(m => {
        initialMappings[m.pms_code] = m.rms_code
      })
    setMappings(initialMappings)
  }, [existingMappings, hotelId])

  const discoverSheets = async () => {
    if (!spreadsheetId) return
    
    setIsDiscovering(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/gsheets/discover?spreadsheetId=${spreadsheetId}`)
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || "Errore nel caricamento dei fogli")
      }
      
      setDiscoveredTabs(data.tabs || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento dei fogli")
    } finally {
      setIsDiscovering(false)
    }
  }

  const handleTabChange = (tabTitle: string) => {
    setSelectedTab(tabTitle)
    setRoomTypesColumn("")
    setRoomTypesFromSheet([])
  }

  const handleColumnChange = (columnHeader: string) => {
    setRoomTypesColumn(columnHeader)
    
    // Extract unique room type values from the selected column
    const tab = discoveredTabs.find(t => t.title === selectedTab)
    if (tab) {
      const columnIndex = tab.headers.indexOf(columnHeader)
      if (columnIndex >= 0) {
        const uniqueValues = new Set<string>()
        tab.sampleRows.forEach(row => {
          const value = row[columnIndex]?.trim()
          if (value && value.length > 0) {
            uniqueValues.add(value)
          }
        })
        setRoomTypesFromSheet(Array.from(uniqueValues).sort())
      }
    }
  }

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
          mappings: Object.entries(mappings).map(([pmsCode, rmsCode]) => ({
            pms_code: pmsCode,
            pms_label: pmsCode, // Use the sheet value as label
            rms_code: rmsCode,
            rms_label: RMS_ROOM_TYPE_CODES.find(r => r.code === rmsCode)?.label || rmsCode
          }))
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

  const selectedTabData = discoveredTabs.find(t => t.title === selectedTab)
  const unmappedCount = roomTypesFromSheet.filter(rt => !mappings[rt]).length
  const mappedCount = roomTypesFromSheet.filter(rt => mappings[rt]).length

  if (!spreadsheetId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Mappatura Tipologie Camera (GDocs)
          </CardTitle>
          <CardDescription>Collega le tipologie camera dal foglio Google ai codici RMS standard</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Spreadsheet non configurato</AlertTitle>
            <AlertDescription>
              Configura prima lo spreadsheet ID nelle impostazioni PMS per poter mappare le tipologie camera.
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
              Mappatura Tipologie Camera (GDocs)
            </CardTitle>
            <CardDescription>
              Seleziona il foglio e la colonna con le tipologie camera, poi mappale ai codici RMS standard per {hotelName}
            </CardDescription>
          </div>
          {roomTypesFromSheet.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant={unmappedCount > 0 ? "destructive" : "default"}>
                {mappedCount}/{roomTypesFromSheet.length} mappate
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
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Errore</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {success && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">Successo</AlertTitle>
            <AlertDescription className="text-green-700">{success}</AlertDescription>
          </Alert>
        )}

        {/* Step 1: Select Sheet Tab */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>1. Seleziona il foglio con le tipologie</Label>
            {isDiscovering ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Caricamento fogli...
              </div>
            ) : (
              <Select value={selectedTab} onValueChange={handleTabChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona un foglio..." />
                </SelectTrigger>
                <SelectContent>
                  {discoveredTabs.map((tab) => (
                    <SelectItem key={tab.title} value={tab.title}>
                      <span className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4" />
                        {tab.title}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Step 2: Select Column */}
          {selectedTab && selectedTabData && (
            <div className="space-y-2">
              <Label>2. Seleziona la colonna con le tipologie</Label>
              <Select value={roomTypesColumn} onValueChange={handleColumnChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona una colonna..." />
                </SelectTrigger>
                <SelectContent>
                  {selectedTabData.headers.map((header) => (
                    <SelectItem key={header} value={header}>
                      {header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Step 3: Map Room Types */}
        {roomTypesFromSheet.length > 0 && (
          <div className="space-y-2">
            <Label>3. Mappa le tipologie ai codici RMS</Label>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Tipologia dal Foglio</TableHead>
                  <TableHead className="w-[40%]">Codice RMS Standard</TableHead>
                  <TableHead className="w-[20%]">Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roomTypesFromSheet.map((roomType) => (
                  <TableRow key={roomType}>
                    <TableCell>
                      <span className="font-medium">{roomType}</span>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={mappings[roomType] || ""}
                        onValueChange={(value) => handleMappingChange(roomType, value)}
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
                      {mappings[roomType] ? (
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
          </div>
        )}

        {/* Empty state */}
        {selectedTab && roomTypesColumn && roomTypesFromSheet.length === 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Nessuna tipologia trovata</AlertTitle>
            <AlertDescription>
              Non sono state trovate tipologie nella colonna selezionata. Verifica di aver selezionato la colonna corretta.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
