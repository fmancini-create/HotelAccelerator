"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCw, FileSpreadsheet, CheckCircle2, XCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface CategoryMapping {
  enabled?: boolean
  sheetTab?: string
}

interface GSheetsSyncPanelProps {
  hotelId: string
  spreadsheetId: string | null
  bookingTab?: string | null
  availabilityTab?: string | null
  lastSyncAt?: string | null
  lastSyncStatus?: string | null
  // Full gsheets_mapping config for showing all categories
  gsheetsMapping?: {
    prenotazioni?: CategoryMapping
    disponibilita?: CategoryMapping
    produzione?: CategoryMapping
    camere_vendute?: CategoryMapping
    rooms_production?: CategoryMapping
    rooms_occupancy?: CategoryMapping
    tariffe?: CategoryMapping
    prezzi_matrice?: CategoryMapping
    [key: string]: CategoryMapping | undefined
  }
}

// Human-readable labels for categories
const CATEGORY_LABELS: Record<string, string> = {
  prenotazioni: "Prenotazioni",
  disponibilita: "Disponibilita",
  produzione: "Produzione",
  camere_vendute: "Camere Vendute",
  rooms_production: "Produzione per Camera",
  rooms_occupancy: "Occupancy per Camera",
  tariffe: "Tariffe",
  prezzi_matrice: "Matrice Prezzi",
}

export function GSheetsSyncPanel({
  hotelId,
  spreadsheetId,
  bookingTab,
  availabilityTab,
  lastSyncAt,
  lastSyncStatus,
  gsheetsMapping,
}: GSheetsSyncPanelProps) {
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)

  const handleSync = async () => {
    try {
      setSyncing(true)
      setError(null)
      setResult(null)

      const response = await fetch(`/api/gsheets/sync?hotelId=${hotelId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      const data = await response.json()

      if (response.ok) {
        setResult(data)
      } else {
        setError(data.error || "Errore durante la sincronizzazione")
      }
    } catch (err: any) {
      setError(err.message || "Errore di rete")
    } finally {
      setSyncing(false)
    }
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "Mai"
    return new Date(dateStr).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <Card className="border-green-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-green-600" />
          Sincronizzazione Google Sheets
        </CardTitle>
        <CardDescription className="text-xs">
          Importa prenotazioni e disponibilita dal foglio Google configurato
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Config info */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="text-muted-foreground">Spreadsheet:</div>
          <div className="font-mono truncate">{spreadsheetId ? `...${spreadsheetId.slice(-12)}` : "N/A"}</div>
          
          {/* Show all enabled categories from gsheetsMapping */}
          {gsheetsMapping && Object.entries(gsheetsMapping).map(([key, mapping]) => {
            if (!mapping?.enabled || !mapping?.sheetTab) return null
            const label = CATEGORY_LABELS[key] || key
            return (
              <React.Fragment key={key}>
                <div className="text-muted-foreground">{label}:</div>
                <div className="font-medium truncate" title={mapping.sheetTab}>{mapping.sheetTab}</div>
              </React.Fragment>
            )
          })}
          
          {/* Fallback for old props if no gsheetsMapping */}
          {!gsheetsMapping && bookingTab && (
            <>
              <div className="text-muted-foreground">Tab Prenotazioni:</div>
              <div className="font-medium">{bookingTab}</div>
            </>
          )}
          {!gsheetsMapping && availabilityTab && (
            <>
              <div className="text-muted-foreground">Tab Disponibilita:</div>
              <div className="font-medium">{availabilityTab}</div>
            </>
          )}
          
          <div className="text-muted-foreground">Ultimo sync:</div>
          <div className="flex items-center gap-1">
            {lastSyncStatus === "success" && <CheckCircle2 className="h-3 w-3 text-green-500" />}
            {lastSyncStatus === "failed" && <XCircle className="h-3 w-3 text-red-500" />}
            <span>{formatDate(lastSyncAt)}</span>
          </div>
        </div>

        {/* Sync button */}
        <Button onClick={handleSync} disabled={syncing} size="sm" className="w-full" variant="outline">
          {syncing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sincronizzazione in corso...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Sincronizza Ora
            </>
          )}
        </Button>

        {/* Error */}
        {error && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {/* Result */}
        {result && (
          <Alert className={result.success ? "bg-green-50 border-green-200 py-2" : "bg-red-50 border-red-200 py-2"}>
            <AlertDescription className="text-xs space-y-1">
              <div className="flex items-center gap-2">
                {result.success ? (
                  <Badge className="bg-green-500 text-white text-xs">Completato</Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">Errore</Badge>
                )}
              </div>
              {result.bookings_imported > 0 && (
                <p>Prenotazioni importate: <strong>{result.bookings_imported}</strong></p>
              )}
              {result.availability_imported > 0 && (
                <p>Disponibilita importate: <strong>{result.availability_imported}</strong></p>
              )}
              {result.room_types_imported > 0 && (
                <p>Tipologie camere create: <strong>{result.room_types_imported}</strong></p>
              )}
              {result.bookings_errors?.length > 0 && (
                <p className="text-red-600">Errori prenotazioni: {result.bookings_errors.length}</p>
              )}
              {result.error && <p className="text-red-600">{result.error}</p>}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
