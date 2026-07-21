"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus } from "lucide-react"

interface PMSMonitoringProps {
  pmsIntegrations: any[]
}

export function AdminPMSMonitoring({ pmsIntegrations }: PMSMonitoringProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Monitoraggio PMS / Connettori</CardTitle>
            <CardDescription>Gestisci i connettori PMS attivi nel sistema</CardDescription>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Crea Nuovo Connettore
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome PMS</TableHead>
              <TableHead>Struttura</TableHead>
              <TableHead>Endpoint</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Ultima Sincronizzazione</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pmsIntegrations.map((pms) => (
              <TableRow key={pms.id}>
                <TableCell className="font-medium">
                  <Badge variant="outline">{pms.pms_name}</Badge>
                </TableCell>
                <TableCell>{pms.hotel?.name || "N/A"}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                  {pms.endpoint_url || "N/A"}
                </TableCell>
                <TableCell>
                  <Badge variant={pms.is_active ? "default" : "secondary"}>
                    {pms.is_active ? "Attivo" : "Inattivo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {pms.last_sync_at ? new Date(pms.last_sync_at).toLocaleString("it-IT") : "Mai"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
