"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Eye, Settings, Search } from "lucide-react"
import Link from "next/link"

interface StructuresSectionProps {
  hotels: any[]
}

export function AdminStructuresSection({ hotels }: StructuresSectionProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [pmsFilter, setPmsFilter] = useState<string>("all")

  // Get unique PMS names for filter
  const pmsNames = Array.from(
    new Set(
      hotels
        .flatMap((h) => h.pms_integrations || [])
        .map((p: any) => p.pms_name)
        .filter(Boolean),
    ),
  )

  // Filter hotels
  const filteredHotels = hotels.filter((hotel) => {
    const matchesSearch = hotel.name.toLowerCase().includes(searchQuery.toLowerCase())
    const pmsIntegration = hotel.pms_integrations?.[0]
    const matchesPms = pmsFilter === "all" || pmsIntegration?.pms_name === pmsFilter
    return matchesSearch && matchesPms
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Strutture & Utenti</CardTitle>
            <CardDescription>Gestisci tutte le strutture collegate al sistema</CardDescription>
          </div>
          <div className="flex gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca struttura..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={pmsFilter} onValueChange={setPmsFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Filtra per PMS" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i PMS</SelectItem>
                {pmsNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredHotels.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nessuna struttura trovata</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome Struttura</TableHead>
                <TableHead>PMS Collegato</TableHead>
                <TableHead>Stato Sincronizzazione</TableHead>
                <TableHead>Ultima Modifica</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHotels.map((hotel) => {
                const pmsIntegration = hotel.pms_integrations?.[0]
                const syncStatus = pmsIntegration?.last_sync_status || "unknown"

                return (
                  <TableRow key={hotel.id}>
                    <TableCell className="font-medium">{hotel.name}</TableCell>
                    <TableCell>
                      {pmsIntegration ? (
                        <Badge variant="outline">{pmsIntegration.pms_name}</Badge>
                      ) : (
                        <span className="text-muted-foreground">Nessuno</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          syncStatus === "success" ? "default" : syncStatus === "error" ? "destructive" : "secondary"
                        }
                      >
                        {syncStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {pmsIntegration?.last_sync_at
                        ? new Date(pmsIntegration.last_sync_at).toLocaleString("it-IT")
                        : "Mai"}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/dashboard?hotel_id=${hotel.id}`}>
                          <Eye className="h-4 w-4 mr-1" />
                          Impersona
                        </Link>
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/settings/pms?hotel_id=${hotel.id}`}>
                          <Settings className="h-4 w-4 mr-1" />
                          PMS
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
