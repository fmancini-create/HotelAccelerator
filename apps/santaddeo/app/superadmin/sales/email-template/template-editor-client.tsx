"use client"

import useSWR from "swr"
import { useEffect, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowLeft, Save, RefreshCw, Eye } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const PLACEHOLDERS = [
  { token: "{{nome_lead}}", desc: "Nome del potenziale cliente" },
  { token: "{{cognome_lead}}", desc: "Cognome del potenziale cliente" },
  { token: "{{nome_struttura}}", desc: "Nome dell'hotel/struttura" },
  { token: "{{nome_venditore}}", desc: "Nome del venditore (display_name)" },
  { token: "{{email_venditore}}", desc: "Email del venditore (per replyTo)" },
  { token: "{{link_signup}}", desc: "Link signup con tracking ?ref=" },
  { token: "{{link_dashboard_demo}}", desc: "Link landing dashboard gratuita con tracking" },
]

const DEFAULT_SUBJECT =
  "{{nome_lead}}, una proposta per {{nome_struttura}}"

const DEFAULT_HTML = `<p>Ciao <strong>{{nome_lead}}</strong>,</p>
<p>Sono <strong>{{nome_venditore}}</strong> di SANTADDEO. Mi occupo di aiutare strutture come <strong>{{nome_struttura}}</strong> ad aumentare il fatturato camera senza extra-stress.</p>
<p>Ti ho preparato una <strong>dashboard gratuita</strong> con tutti i KPI del tuo hotel (occupazione, ADR, RevPAR) collegata al tuo PMS. Puoi attivarla in 2 minuti, zero costi.</p>
<p style="margin: 30px 0;">
  <a href="{{link_dashboard_demo}}" style="background: #0ea5e9; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Prova gratis ora</a>
</p>
<p>Se preferisci una chiamata, rispondi pure a questa mail.</p>
<p>A presto,<br/><strong>{{nome_venditore}}</strong><br/><a href="mailto:{{email_venditore}}">{{email_venditore}}</a></p>`

export function TemplateEditorClient() {
  const { data, mutate, isLoading } = useSWR<{ template: any }>(
    "/api/superadmin/sales/email-template",
    fetcher,
  )
  const [subject, setSubject] = useState("")
  const [html, setHtml] = useState("")
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)

  useEffect(() => {
    if (data?.template) {
      setSubject(data.template.subject_template ?? "")
      setHtml(data.template.html_template ?? "")
    } else if (data && !data.template && !isLoading) {
      setSubject(DEFAULT_SUBJECT)
      setHtml(DEFAULT_HTML)
    }
  }, [data, isLoading])

  async function save() {
    setBusy(true)
    try {
      const res = await fetch("/api/superadmin/sales/email-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_template: subject, html_template: html }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(j.error || "Errore salvataggio")
        return
      }
      mutate()
    } finally {
      setBusy(false)
    }
  }

  async function loadPreview() {
    setPreviewBusy(true)
    try {
      const res = await fetch("/api/superadmin/sales/email-template/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_template: subject, html_template: html }),
      })
      const j = await res.json()
      if (res.ok) setPreview({ subject: j.subject, html: j.html })
      else alert(j.error || "Errore preview")
    } finally {
      setPreviewBusy(false)
    }
  }

  function insertPlaceholder(token: string) {
    setHtml((h) => h + token)
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <Link
        href="/superadmin/sales"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Tutti i venditori
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Template email lead</h1>
        <p className="mt-1 text-sm text-gray-600">
          Email di presentazione che il sistema invia automaticamente quando un venditore inserisce
          un nuovo lead. Modificabile solo dal superadmin.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <Label htmlFor="subject">Oggetto email</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="{{nome_lead}}, una proposta per {{nome_struttura}}"
            />

            <Label htmlFor="html" className="mt-4">
              Corpo email (HTML)
            </Label>
            <textarea
              id="html"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={20}
              className="w-full rounded-md border border-gray-300 p-3 font-mono text-xs"
              placeholder="<p>Ciao {{nome_lead}}, ...</p>"
            />

            <div className="mt-4 flex gap-2">
              <Button onClick={save} disabled={busy || !subject || !html}>
                <Save className="mr-2 h-4 w-4" />
                {busy ? "Salvo..." : "Salva template"}
              </Button>
              <Button variant="outline" onClick={loadPreview} disabled={previewBusy}>
                <Eye className="mr-2 h-4 w-4" />
                {previewBusy ? "Preview..." : "Preview"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSubject(DEFAULT_SUBJECT)
                  setHtml(DEFAULT_HTML)
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Default
              </Button>
            </div>
          </Card>

          {preview && (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Preview
                </h3>
                <button
                  onClick={() => setPreview(null)}
                  className="text-xs text-gray-500 hover:underline"
                >
                  chiudi
                </button>
              </div>
              <div className="mb-3 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                <strong>Oggetto:</strong> {preview.subject}
              </div>
              <div
                className="rounded border border-gray-200 bg-white p-4"
                dangerouslySetInnerHTML={{ __html: preview.html }}
              />
              <p className="mt-2 text-xs text-gray-400">
                Dati di esempio: Mario Rossi · Hotel Esempio · venditore Anna Bianchi.
              </p>
            </Card>
          )}
        </div>

        <div>
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Placeholder disponibili
            </h3>
            <ul className="space-y-2 text-sm">
              {PLACEHOLDERS.map((p) => (
                <li key={p.token} className="flex flex-col gap-1">
                  <button
                    onClick={() => insertPlaceholder(p.token)}
                    className="text-left rounded bg-gray-100 px-2 py-1 font-mono text-xs hover:bg-gray-200"
                    title="Click per inserire nel corpo"
                  >
                    {p.token}
                  </button>
                  <span className="text-xs text-gray-500">{p.desc}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t pt-3 text-xs text-gray-500">
              I placeholder vengono sostituiti automaticamente al momento dell&apos;invio. Click su
              un placeholder per inserirlo nel corpo. Il <code>link_signup</code> contiene il
              tracking <code>?ref=</code> per associare il lead al venditore al primo accesso.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
