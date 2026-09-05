"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { HrTimeClockRequirements } from "@/components/hr/hr-time-clock-requirements"

type Employee = { id: string; first_name: string; last_name: string }
type Entry = {
  id: string
  employee_id: string
  clock_in_at: string
  clock_out_at: string | null
  status: string
  clock_in_outside_geofence: boolean
  clock_out_outside_geofence: boolean
}

export function HrWorkforcePanels() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [doc, setDoc] = useState({
    employee_id: "",
    category: "payslip",
    title: "",
    period_month: "",
    expires_on: "",
  })
  const [file, setFile] = useState<File | null>(null)

  async function load() {
    const response = await fetch("/api/admin/hr")
    const body = await response.json()
    if (!response.ok) return

    setEmployees(body.employees || [])
    setEntries(body.time_entries || [])
  }

  useEffect(() => {
    void load()
  }, [])

  async function upload() {
    if (!file || !doc.employee_id || !doc.title) return
    setBusy(true)
    const form = new FormData()
    Object.entries(doc).forEach(([key, value]) => form.append(key, value))
    form.append("file", file)
    const response = await fetch("/api/admin/hr/documents", { method: "POST", body: form })
    setMessage(response.ok ? "Documento caricato nell'archivio privato." : "Caricamento non riuscito.")
    if (response.ok) {
      setFile(null)
      setDoc({ ...doc, title: "", period_month: "", expires_on: "" })
    }
    setBusy(false)
  }

  async function review(id: string) {
    await fetch("/api/admin/hr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "review_time", entry_id: id, decision: "approved" }),
    })
    await load()
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {message && <div className="lg:col-span-2 rounded border p-3 text-sm">{message}</div>}

      <HrTimeClockRequirements />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Buste paga e documenti</CardTitle>
          <CardDescription>
            PDF, immagini o DOCX fino a 15 MB. I file restano privati e il dipendente vede solo i propri.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Select value={doc.employee_id} onValueChange={(value) => setDoc({ ...doc, employee_id: value })}>
            <SelectTrigger><SelectValue placeholder="Dipendente" /></SelectTrigger>
            <SelectContent>
              {employees.map((employee) => (
                <SelectItem key={employee.id} value={employee.id}>
                  {employee.first_name} {employee.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={doc.category} onValueChange={(value) => setDoc({ ...doc, category: value })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="payslip">Busta paga</SelectItem>
              <SelectItem value="contract">Contratto</SelectItem>
              <SelectItem value="certificate">Certificato</SelectItem>
              <SelectItem value="policy">Regolamento</SelectItem>
              <SelectItem value="other">Altro</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Titolo" value={doc.title} onChange={(event) => setDoc({ ...doc, title: event.target.value })} />
          <Input type="month" value={doc.period_month} onChange={(event) => setDoc({ ...doc, period_month: event.target.value })} />
          <Input type="date" title="Scadenza" value={doc.expires_on} onChange={(event) => setDoc({ ...doc, expires_on: event.target.value })} />
          <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.docx" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          <Button disabled={busy || !file || !doc.employee_id || !doc.title} onClick={upload}>Carica documento</Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-base">Timbrature da verificare</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {entries.filter((entry) => entry.status === "needs_review").map((entry) => (
            <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm">
              <span>
                {employees.find((item) => item.id === entry.employee_id)?.first_name}{" "}
                {employees.find((item) => item.id === entry.employee_id)?.last_name} ·{" "}
                {new Date(entry.clock_in_at).toLocaleString("it-IT")} · fuori sede
              </span>
              <Button size="sm" onClick={() => review(entry.id)}>Approva</Button>
            </div>
          ))}
          {!entries.some((entry) => entry.status === "needs_review") && (
            <p className="text-sm text-muted-foreground">Nessuna anomalia da verificare.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
