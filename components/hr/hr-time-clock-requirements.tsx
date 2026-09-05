"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type EmployeeRequirement = {
  id: string
  first_name: string
  last_name: string
  admin_user_id: string | null
  requires_time_clock: boolean
}

export function HrTimeClockRequirements() {
  const [employees, setEmployees] = useState<EmployeeRequirement[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/admin/hr/time-clock-requirements", { cache: "no-store" })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || "Caricamento non riuscito")
      setEmployees(Array.isArray(body.employees) ? body.employees : [])
      setMessage("")
    } catch {
      setMessage("Non riesco a leggere gli obblighi di timbratura.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(employee: EmployeeRequirement) {
    const nextValue = !employee.requires_time_clock
    setSavingId(employee.id)
    setMessage("")
    try {
      const response = await fetch("/api/admin/hr/time-clock-requirements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: employee.id, requires_time_clock: nextValue }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (body.error === "employee_account_required") {
          throw new Error("Collega prima questo dipendente a un utente HotelAccelerator.")
        }
        throw new Error("Impostazione non salvata.")
      }
      setEmployees((current) =>
        current.map((item) =>
          item.id === employee.id ? { ...item, requires_time_clock: Boolean(body.requires_time_clock) } : item,
        ),
      )
      setMessage(nextValue ? "Obbligo di timbratura attivato." : "Obbligo di timbratura disattivato.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impostazione non salvata.")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Obbligo di timbratura mobile</CardTitle>
        <CardDescription>
          Gli utenti abilitati, quando accedono da smartphone, vengono portati prima alla timbratura. Dopo una timbratura riuscita entrano nella dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {message && <div className="rounded border p-3 text-sm">{message}</div>}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Caricamento dipendenti…
          </div>
        ) : employees.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun dipendente attivo.</p>
        ) : (
          employees.map((employee) => (
            <div key={employee.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3">
              <div>
                <div className="font-medium">{employee.first_name} {employee.last_name}</div>
                <div className="text-xs text-muted-foreground">
                  {employee.admin_user_id ? "Account HotelAccelerator collegato" : "Nessun account HotelAccelerator collegato"}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant={employee.requires_time_clock ? "default" : "outline"}
                disabled={savingId === employee.id || (!employee.admin_user_id && !employee.requires_time_clock)}
                onClick={() => void toggle(employee)}
              >
                {savingId === employee.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {employee.requires_time_clock ? "Obbligo attivo" : "Attiva obbligo"}
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
