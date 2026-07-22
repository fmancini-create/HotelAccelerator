"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Mail, ChevronRight } from "lucide-react"
import Link from "next/link"
import { EmailTemplateSelector, type CallOption, type ExtraRecipients } from "@/components/sales/email-template-selector"

export function NewLeadForm({ agentName, agentEmail }: { agentName?: string; agentEmail?: string }) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<"form" | "template">("form")
  const [leadData, setLeadData] = useState({
    first_name: "",
    last_name: "",
    hotel_name: "",
    email: "",
    phone: "",
    notes: "",
  })

  // Step 1: Valida e passa ai template
  function handleContinueToTemplate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = readForm(e.currentTarget)
    if (!data) return
    setLeadData(data)
    setStep("template")
  }

  // Legge e valida i campi del form. Ritorna null (e setta l'errore) se non
  // validi, altrimenti aggiorna leadData e ritorna i dati.
  function readForm(formEl: HTMLFormElement) {
    setError(null)
    const fd = new FormData(formEl)
    const data = {
      first_name: String(fd.get("first_name") ?? "").trim(),
      last_name: String(fd.get("last_name") ?? "").trim(),
      hotel_name: String(fd.get("hotel_name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      phone: String(fd.get("phone") ?? "").trim(),
      notes: String(fd.get("notes") ?? "").trim(),
    }
    if (!data.first_name || !data.last_name || !data.hotel_name || !data.email) {
      setError("Compila tutti i campi obbligatori")
      return null
    }
    if (!data.email.includes("@")) {
      setError("Indirizzo email non valido")
      return null
    }
    setLeadData(data)
    return data
  }

  // Step 1b: Salva subito il lead SENZA inviare email (l'invio non e'
  // obbligatorio: il lead puo' essere contattato in un secondo momento).
  async function handleSaveFromForm(e: React.MouseEvent<HTMLButtonElement>) {
    const formEl = e.currentTarget.form
    if (!formEl) return
    const data = readForm(formEl)
    if (!data) return
    await saveWithoutEmail(data)
  }

  // Step 2a: Salva senza email (dallo step template)
  async function handleSaveWithoutEmail() {
    await saveWithoutEmail(leadData)
  }

  // Logica condivisa di salvataggio senza invio email.
  async function saveWithoutEmail(data: typeof leadData) {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/sales/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...data, send_email: false }),
      })
      const json = await res.json()
      if (!res.ok) {
        handleApiError(json)
        return
      }
      router.push("/sales/leads")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di rete")
    } finally {
      setSubmitting(false)
    }
  }

  // Step 2b: Salva e invia email con template custom
  async function handleSendWithTemplate(
    subject: string,
    body: string,
    callOption?: CallOption,
    recipients?: ExtraRecipients,
  ) {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/sales/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...leadData,
          send_email: true,
          custom_subject: subject,
          custom_body: body,
          call_option: callOption,
          cc: recipients?.cc,
          bcc: recipients?.bcc,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        handleApiError(json)
        return
      }
      if (json.email_error) {
        alert(`Lead salvato ma invio email fallito (${json.email_error}). Puoi riprovare dalla lista.`)
      }
      router.push("/sales/leads")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di rete")
    } finally {
      setSubmitting(false)
    }
  }

  function handleApiError(json: any) {
    if (json.error === "duplicate_lead") {
      setError("Hai gia' un lead con questa email")
    } else if (json.error === "missing_fields") {
      setError("Compila tutti i campi obbligatori")
    } else if (json.error === "invalid_email") {
      setError("Indirizzo email non valido")
    } else {
      setError(json.message ?? "Errore creazione lead")
    }
  }

  // Step 1: Form dati lead
  if (step === "form") {
    return (
      <Card className="p-6">
        <Link
          href="/sales/leads"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Torna alla lista
        </Link>

        <form onSubmit={handleContinueToTemplate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="first_name">Nome*</Label>
            <Input id="first_name" name="first_name" required disabled={submitting} defaultValue={leadData.first_name} />
          </div>
          <div>
            <Label htmlFor="last_name">Cognome*</Label>
            <Input id="last_name" name="last_name" required disabled={submitting} defaultValue={leadData.last_name} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="hotel_name">Nome struttura*</Label>
            <Input id="hotel_name" name="hotel_name" required disabled={submitting} defaultValue={leadData.hotel_name} />
          </div>
          <div>
            <Label htmlFor="email">Email*</Label>
            <Input id="email" name="email" type="email" required disabled={submitting} defaultValue={leadData.email} />
          </div>
          <div>
            <Label htmlFor="phone">Telefono (opzionale)</Label>
            <Input id="phone" name="phone" type="tel" disabled={submitting} defaultValue={leadData.phone} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="notes">Note interne (opzionali, non visibili al lead)</Label>
            <Textarea id="notes" name="notes" rows={3} disabled={submitting} defaultValue={leadData.notes} />
          </div>

          {error ? (
            <div className="md:col-span-2 text-sm text-destructive">{error}</div>
          ) : null}

          <div className="md:col-span-2 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 pt-4 border-t">
            <Link
              href="/sales/leads"
              className="text-sm text-muted-foreground hover:text-foreground sm:mr-auto"
            >
              Annulla
            </Link>
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveFromForm}
              disabled={submitting}
            >
              <Mail className="h-4 w-4 mr-2 opacity-50" />
              Salva senza inviare email
            </Button>
            <Button type="submit" disabled={submitting}>
              Continua con email <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </form>
      </Card>
    )
  }

  // Step 2: Selezione template email
  return (
    <Card className="p-6">
      <button
        onClick={() => setStep("form")}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Modifica dati lead
      </button>

      <div className="mb-6">
        <h2 className="text-xl font-semibold">Invia email a {leadData.first_name}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Struttura: <strong>{leadData.hotel_name}</strong> - {leadData.email}
        </p>
      </div>

      {error ? (
        <div className="mb-4 text-sm text-destructive">{error}</div>
      ) : null}

      <EmailTemplateSelector
        leadData={leadData}
        agentName={agentName}
        agentEmail={agentEmail}
        onSend={handleSendWithTemplate}
        onCancel={() => setStep("form")}
      />

      <div className="mt-6 pt-4 border-t">
        <Button
          variant="outline"
          onClick={handleSaveWithoutEmail}
          disabled={submitting}
          className="w-full"
        >
          <Mail className="h-4 w-4 mr-2 opacity-50" />
          Salva senza inviare email
        </Button>
      </div>
    </Card>
  )
}
