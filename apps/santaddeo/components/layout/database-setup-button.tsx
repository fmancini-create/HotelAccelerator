"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Database } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function DatabaseSetupButton() {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()

  const handleClick = () => {
    router.push("/settings/pms")
  }

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        size="sm"
        variant="ghost"
        className="h-8 bg-white/10 text-white hover:bg-white/20"
      >
        <Database className="h-4 w-4 mr-1" />
        Setup DB
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Setup Schema Connectors</DialogTitle>
            <DialogDescription>
              Crea lo schema "connectors" nel database per abilitare la sincronizzazione con i PMS esterni.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
              <div className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5">!</div>
              <div className="flex-1 min-w-0 text-sm">
                <div className="font-medium text-blue-900 dark:text-blue-100">Cosa fa questo setup?</div>
                <div className="text-blue-700 dark:text-blue-300 mt-1">
                  Crea lo schema "connectors" con tutte le tabelle necessarie per salvare i dati grezzi provenienti dai
                  PMS. Questo è il primo passo per abilitare la sincronizzazione automatica.
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Chiudi
              </Button>
              <Button onClick={handleClick}>
                <Database className="h-4 w-4 mr-2" />
                Avvia Setup
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
