"use client"

import { useEffect, useState } from "react"
import { AdminHeader } from "@/components/admin/admin-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { DEFAULT_COOKIE_POLICY, DEFAULT_PRIVACY_POLICY } from "@/lib/cms/tenant-site-settings"

type Form = Record<string, string>
const initial: Form = { billing_company_name: "", billing_vat: "", billing_tax_code: "", billing_address: "", billing_city: "", billing_postal_code: "", billing_province: "", billing_email: "", legal_rea: "", legal_registry: "", legal_share_capital: "", site_privacy_policy: DEFAULT_PRIVACY_POLICY, site_cookie_policy: DEFAULT_COOKIE_POLICY }

export default function SiteLegalSettingsPage() {
  const [form, setForm] = useState<Form>(initial)
  const [whiteLabel, setWhiteLabel] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { void fetch("/api/admin/site-legal").then((response) => response.json()).then((data) => {
    if (!data.settings) return
    setWhiteLabel(Boolean(data.whiteLabel))
    setForm({
      billing_company_name: data.settings.companyName || "", billing_vat: data.settings.vatNumber || "", billing_tax_code: data.settings.taxCode || "", billing_address: data.settings.address || "", billing_city: data.settings.city || "", billing_postal_code: data.settings.postalCode || "", billing_province: data.settings.province || "", billing_email: data.settings.email || "", legal_rea: data.settings.rea || "", legal_registry: data.settings.registry || "", legal_share_capital: data.settings.shareCapital || "", site_privacy_policy: data.settings.privacyPolicy, site_cookie_policy: data.settings.cookiePolicy,
    })
  }).catch(() => toast.error("Impossibile caricare i dati")) }, [])

  async function save() {
    setSaving(true)
    const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() || null]))
    payload.site_privacy_policy = form.site_privacy_policy
    payload.site_cookie_policy = form.site_cookie_policy
    const response = await fetch("/api/admin/site-legal", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    setSaving(false)
    if (!response.ok) return toast.error("Salvataggio non riuscito")
    toast.success("Dati legali e policy salvati")
  }

  const field = (key: string, label: string) => <div><Label htmlFor={key}>{label}</Label><Input id={key} className="mt-1" value={form[key] || ""} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></div>
  return <div className="min-h-full bg-background"><AdminHeader title="Dati legali e policy" subtitle="Informazioni pubblicate automaticamente nel sito" /><main className="mx-auto max-w-5xl space-y-6 p-6">
    <Card><CardHeader><CardTitle>Dati aziendali</CardTitle><CardDescription>I campi valorizzati appaiono automaticamente nel footer pubblico.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">{field("billing_company_name", "Ragione sociale")}{field("billing_vat", "Partita IVA")}{field("billing_tax_code", "Codice fiscale")}{field("billing_address", "Sede legale")}{field("billing_city", "Comune")}{field("billing_postal_code", "CAP")}{field("billing_province", "Provincia")}{field("billing_email", "Email")}{field("legal_registry", "Registro Imprese")}{field("legal_rea", "REA")}{field("legal_share_capital", "Capitale sociale")}</CardContent></Card>
    <Card><CardHeader><CardTitle>Privacy e cookie</CardTitle><CardDescription>Testi precompilati, da verificare e personalizzare in base ai trattamenti effettivi della struttura.</CardDescription></CardHeader><CardContent className="space-y-5"><div><Label htmlFor="privacy">Privacy Policy</Label><Textarea id="privacy" className="mt-1 min-h-52" value={form.site_privacy_policy} onChange={(event) => setForm({ ...form, site_privacy_policy: event.target.value })} /></div><div><Label htmlFor="cookie">Cookie Policy</Label><Textarea id="cookie" className="mt-1 min-h-52" value={form.site_cookie_policy} onChange={(event) => setForm({ ...form, site_cookie_policy: event.target.value })} /></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Branding 4BID</CardTitle><CardDescription>{whiteLabel ? "Opzione White Label attiva: la firma 4BID non appare sul sito pubblicato." : "La firma 4BID è obbligatoria. Può essere rimossa acquistando l'opzione White Label."}</CardDescription></CardHeader></Card>
    <div className="flex justify-end"><Button onClick={save} disabled={saving}>{saving ? "Salvataggio..." : "Salva"}</Button></div>
  </main></div>
}
