"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertCircle, Settings, Headphones } from "lucide-react"

interface SetupReminderDialogProps {
  isSetupComplete: boolean
  /** plan_type dell'abbonamento: serve a indirizzare il tour demo. */
  planType?: string | null
}

export function SetupReminderDialog({ isSetupComplete, planType }: SetupReminderDialogProps) {
  const [open, setOpen] = useState(false)
  // Se il tenant e' su fee mensile, il tour deve mostrare solo le fatture.
  const normalizedPlan = (planType || "").toLowerCase()
  const isMonthlyFee =
    normalizedPlan === "monthly_fee" || normalizedPlan === "monthly" || normalizedPlan === "fee"
  const demoHref = isMonthlyFee ? "/demo?plan=fee" : "/demo"

  // Chiave per ricordare che l'utente ha gia' chiuso l'avviso ("Ricordamelo
  // dopo"): evita che il dialog riappaia ad ogni accesso. Viene ignorata una
  // volta che il setup e' completo (il dialog non si mostra comunque piu').
  const DISMISS_KEY = "santaddeo:setup-reminder-dismissed"

  useEffect(() => {
    if (isSetupComplete) return
    // Mostra l'avviso solo se non e' gia' stato chiuso in precedenza.
    let dismissed = false
    try {
      dismissed = window.localStorage.getItem(DISMISS_KEY) === "1"
    } catch {
      dismissed = false
    }
    if (!dismissed) {
      setOpen(true)
    }
  }, [isSetupComplete])

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // localStorage non disponibile: chiudiamo comunque per questa sessione.
    }
    setOpen(false)
  }

  if (isSetupComplete) {
    return null
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          handleDismiss()
        } else {
          setOpen(true)
        }
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden break-words">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            <DialogTitle>Completa la Configurazione</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            Per utilizzare al meglio SANTADDEO, completa la configurazione del tuo account o configura direttamente la
            connessione al tuo PMS.
          </DialogDescription>
        </DialogHeader>

        {/* Mentre lo staff configura la connessione al PMS, invitiamo il tenant
            a esplorare la piattaforma con il tour guidato vocale. */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm dark:border-blue-900/50 dark:bg-blue-950/30">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
              <Headphones className="h-4 w-4" />
            </span>
            <div className="space-y-1 min-w-0">
              <p className="font-semibold text-blue-900 dark:text-blue-100">
                Nel frattempo, fai un giro nella piattaforma
              </p>
              <p className="text-blue-800/90 dark:text-blue-200/80">
                Il nostro staff sta configurando la connessione al tuo PMS. Intanto puoi esplorare SANTADDEO con
                l&apos;audio-guida: ti accompagna passo passo tra le funzioni.
              </p>
              <Link href={demoHref} className="inline-block pt-1">
                <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700">
                  <Headphones className="h-4 w-4" />
                  Avvia il tour guidato
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col gap-3 sm:gap-2">
          <Link href="/onboarding" className="w-full">
            <Button className="w-full">Completa Configurazione</Button>
          </Link>
          <Link href="/settings/pms" className="w-full">
            <Button variant="outline" className="w-full bg-transparent">
              <Settings className="h-4 w-4 mr-2" />
              Configura PMS
            </Button>
          </Link>
          <Button variant="ghost" onClick={handleDismiss} className="w-full">
            Ricordamelo dopo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
