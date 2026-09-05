"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { Loader2, LockKeyhole, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScoutAssignmentPanel } from "@/components/crm/scout-assignment-panel"

type Access = {
  enabled: boolean
  canAssign: boolean
  isAdmin: boolean
  isGroupLead: boolean
  isSuperAdmin: boolean
  userId: string | null
  label: string
}

export function ScoutAccessGate({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<Access | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const response = await fetch("/api/admin/crm/scout/access", { cache: "no-store" })
        const payload = await response.json().catch(() => null)
        if (!alive) return
        if (!response.ok) {
          setError(payload?.error || "Impossibile verificare il permesso Scout.")
          return
        }
        setAccess(payload as Access)
      } catch {
        if (alive) setError("Impossibile verificare il permesso Scout.")
      }
    })()
    return () => { alive = false }
  }, [])

  if (!access && !error) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Verifica accesso Scout" />
      </div>
    )
  }

  if (error || !access?.enabled) {
    return (
      <div className="mx-auto max-w-3xl py-8">
        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <LockKeyhole className="h-5 w-5" aria-hidden />
            </div>
            <CardTitle>Scout non abilitato per il tuo utente</CardTitle>
            <CardDescription>
              {error || "L'accesso a Scout viene deciso singolarmente dall'amministratore del tenant."}
            </CardDescription>
          </CardHeader>
          {access?.isAdmin && (
            <CardContent>
              <Button asChild variant="outline">
                <Link href="/admin/users"><Settings className="mr-2 h-4 w-4" />Gestisci permessi Scout</Link>
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    )
  }

  return (
    <>
      {children}
      <ScoutAssignmentPanel />
    </>
  )
}
