"use client"

import { Card } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

export function SqlExecutor() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Configurazione Database</h3>
        <p className="text-sm text-muted-foreground">
          Stato della configurazione del database per l'architettura Sant'Addeo.
        </p>
      </div>

      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertDescription>
          <div className="space-y-2">
            <p className="font-medium">Database configurato correttamente</p>
            <p className="text-sm">
              Tutte le tabelle necessarie sono state create e i ruoli sono stati aggiornati alla nuova nomenclatura.
            </p>
          </div>
        </AlertDescription>
      </Alert>

      <Card className="p-4">
        <h4 className="font-medium mb-3">Tabelle Configurate</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>profiles (ruoli aggiornati)</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>bookings_full</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>user_property_map</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>consultant_kpi</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>daily_production</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>daily_availability</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>daily_occupancy</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>sync_jobs (con flag sync_type)</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>bookings (con flag is_frozen)</span>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h4 className="font-medium mb-2">Modifiche Manuali al Database</h4>
        <p className="text-sm text-muted-foreground mb-3">
          Se hai bisogno di eseguire modifiche manuali al database, puoi farlo tramite il SQL Editor di Supabase.
        </p>
        <Button variant="outline" size="sm" asChild>
          <a
            href="https://supabase.com/dashboard/project/_/sql"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2"
          >
            Apri SQL Editor
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </Card>
    </div>
  )
}
