"use client"

import type React from "react"

import Link from "next/link"
import { AlertTriangle, Info, XCircle, Loader2, ShieldAlert, PlayCircle, Sparkles } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { DashboardGuardResult } from "@/lib/guards/dashboard-guard"

interface DashboardBlockProps {
  result: DashboardGuardResult
  children?: React.ReactNode
}

export function DashboardBlock({ result, children }: DashboardBlockProps) {
  if (result.allowed) {
    return <>{children}</>
  }

  const getIcon = () => {
    switch (result.blockCode) {
      case "MAPPING_NOT_VALIDATED":
        return <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
      case "BINDING_INCOMPLETE":
        return <AlertTriangle className="h-12 w-12 text-amber-500" />
      case "NO_MAPPING":
        return <ShieldAlert className="h-12 w-12 text-amber-500" />
      default:
        return <XCircle className="h-12 w-12 text-red-500" />
    }
  }

  const getTitle = () => {
    switch (result.blockCode) {
      case "NO_MAPPING":
        return "Configurazione PMS Richiesta"
      case "MAPPING_NOT_VALIDATED":
        return "Configurazione in Corso"
      case "BINDING_INCOMPLETE":
        return "Configurazione Incompleta"
      case "NO_DATA":
        return "Nessun Dato Disponibile"
      default:
        return "Accesso Bloccato"
    }
  }

  const getDescription = () => {
    switch (result.blockCode) {
      case "NO_MAPPING":
        return "Per visualizzare i dati è necessario configurare il collegamento al PMS. Contatta il supporto Santaddeo per completare la configurazione."
      case "MAPPING_NOT_VALIDATED":
        return "La configurazione PMS è in fase di validazione da parte del team Santaddeo. I dati saranno disponibili non appena completata la verifica."
      case "BINDING_INCOMPLETE":
        return "Alcune configurazioni della struttura devono essere completate prima di poter visualizzare i dati. Contatta il supporto per assistenza."
      case "NO_DATA":
        return "Non sono ancora stati importati dati dal PMS. La prima sincronizzazione potrebbe richiedere alcuni minuti."
      default:
        return result.reason || "Si è verificato un errore imprevisto."
    }
  }

  const getStatusBadge = () => {
    if (!result.mappingVersion) return null

    const statusConfig: Record<
      string,
      { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
    > = {
      draft: { label: "DRAFT", variant: "secondary" },
      validated: { label: "VALIDATED", variant: "default" },
      locked: { label: "LOCKED", variant: "outline" },
      deprecated: { label: "DEPRECATED", variant: "destructive" },
    }

    const config = statusConfig[result.mappingVersion.status] || statusConfig.draft

    return (
      <Badge variant={config.variant} className="ml-2">
        {config.label}
      </Badge>
    )
  }
  // </CHANGE>

  return (
    <div className="flex items-center justify-center min-h-[400px] p-8">
      <Card className="max-w-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">{getIcon()}</div>
          <CardTitle>{getTitle()}</CardTitle>
          <CardDescription className="text-base mt-2">{getDescription()}</CardDescription>
        </CardHeader>
        <CardContent>
          {result.mappingVersion && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle className="flex items-center">
                Dettagli Tecnici
                {getStatusBadge()}
              </AlertTitle>
              <AlertDescription className="text-sm text-muted-foreground">
                Versione mappatura: v{result.mappingVersion.version}
              </AlertDescription>
            </Alert>
          )}

          <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="space-y-3">
                <div>
                  <p className="font-medium text-foreground">Nel frattempo, scopri Santaddeo</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Mentre completiamo la configurazione della tua struttura, fai un tour guidato
                    della piattaforma con una struttura dimostrativa: vedrai dashboard, tariffe,
                    produzione e analisi esattamente come funzioneranno con i tuoi dati.
                  </p>
                </div>
                <Button asChild className="gap-2">
                  <Link href="/demo">
                    <PlayCircle className="h-4 w-4" />
                    Fai un tour della demo
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <ShieldAlert className="h-3 w-3" />
              Questo blocco è un vincolo architetturale per garantire l'integrità dei dati.
            </p>
          </div>
          {/* </CHANGE> */}
        </CardContent>
      </Card>
    </div>
  )
}
