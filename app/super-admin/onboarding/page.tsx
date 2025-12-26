"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, ArrowLeft, ArrowRight, Check, Globe, Mail, CreditCard, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"

type Plan = "free" | "starter" | "professional" | "enterprise"

interface TenantForm {
  // Step 1: Basic Info
  name: string
  slug: string

  // Step 2: Plan
  plan: Plan
  trialDays: number

  // Step 3: Admin User
  adminEmail: string
  adminName: string

  // Step 4: Features
  inboxEnabled: boolean
  cmsEnabled: boolean
  aiEnabled: boolean
}

const plans = [
  {
    id: "free" as Plan,
    name: "Free",
    price: 0,
    description: "Per iniziare",
    features: ["5 pagine CMS", "10 foto", "100 conversazioni/mese"],
  },
  {
    id: "starter" as Plan,
    name: "Starter",
    price: 49,
    description: "Per piccole strutture",
    features: ["25 pagine CMS", "100 foto", "500 conversazioni/mese", "1 canale email"],
  },
  {
    id: "professional" as Plan,
    name: "Professional",
    price: 149,
    description: "Per strutture in crescita",
    features: ["100 pagine CMS", "500 foto", "2000 conversazioni/mese", "5 canali email", "AI Assistant"],
    popular: true,
  },
  {
    id: "enterprise" as Plan,
    name: "Enterprise",
    price: 399,
    description: "Per grandi strutture",
    features: [
      "Illimitato",
      "Storage illimitato",
      "Conversazioni illimitate",
      "Canali illimitati",
      "AI avanzata",
      "SLA garantito",
    ],
  },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<TenantForm>({
    name: "",
    slug: "",
    plan: "professional",
    trialDays: 14,
    adminEmail: "",
    adminName: "",
    inboxEnabled: true,
    cmsEnabled: true,
    aiEnabled: false,
  })

  const updateForm = (updates: Partial<TenantForm>) => {
    setForm((prev) => ({ ...prev, ...updates }))
  }

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  }

  const handleNameChange = (name: string) => {
    updateForm({
      name,
      slug: generateSlug(name),
    })
  }

  const canProceed = () => {
    switch (step) {
      case 1:
        return form.name.length >= 3 && form.slug.length >= 3
      case 2:
        return form.plan
      case 3:
        return form.adminEmail.includes("@") && form.adminName.length >= 2
      case 4:
        return true
      default:
        return false
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/super-admin/structures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          plan: form.plan,
          trial_ends_at:
            form.trialDays > 0 ? new Date(Date.now() + form.trialDays * 24 * 60 * 60 * 1000).toISOString() : null,
          admin_email: form.adminEmail,
          admin_name: form.adminName,
          inbox_enabled: form.inboxEnabled,
          cms_enabled: form.cmsEnabled,
          ai_enabled: form.aiEnabled,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Errore nella creazione")
      }

      router.push("/super-admin/structures")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" onClick={() => router.back()} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Indietro
          </Button>
          <h1 className="text-2xl font-bold text-neutral-900">Nuovo Tenant</h1>
          <p className="text-neutral-500 mt-1">Crea una nuova struttura sulla piattaforma</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                    s < step
                      ? "bg-emerald-500 text-white"
                      : s === step
                        ? "bg-neutral-900 text-white"
                        : "bg-neutral-200 text-neutral-500"
                  }`}
                >
                  {s < step ? <Check className="w-5 h-5" /> : s}
                </div>
                {s < 4 && (
                  <div
                    className={`w-full h-1 mx-2 ${s < step ? "bg-emerald-500" : "bg-neutral-200"}`}
                    style={{ width: "80px" }}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-neutral-500">
            <span>Info Base</span>
            <span>Piano</span>
            <span>Admin</span>
            <span>Features</span>
          </div>
        </div>

        {/* Step Content */}
        <Card>
          {step === 1 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Informazioni Base
                </CardTitle>
                <CardDescription>Inserisci i dati fondamentali della nuova struttura</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Struttura</Label>
                  <Input
                    id="name"
                    placeholder="es. Hotel Belvedere"
                    value={form.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug (URL)</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-500 text-sm">hotelaccelerator.com/</span>
                    <Input
                      id="slug"
                      placeholder="hotel-belvedere"
                      value={form.slug}
                      onChange={(e) => updateForm({ slug: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-neutral-500">
                    Sarà anche il sottodominio: {form.slug || "nome"}.hotelaccelerator.com
                  </p>
                </div>
              </CardContent>
            </>
          )}

          {step === 2 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  Seleziona Piano
                </CardTitle>
                <CardDescription>Scegli il piano più adatto alle esigenze della struttura</CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={form.plan}
                  onValueChange={(value) => updateForm({ plan: value as Plan })}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  {plans.map((plan) => (
                    <div key={plan.id} className="relative">
                      <RadioGroupItem value={plan.id} id={plan.id} className="peer sr-only" />
                      <Label
                        htmlFor={plan.id}
                        className={`flex flex-col p-4 border-2 rounded-lg cursor-pointer transition-colors peer-data-[state=checked]:border-neutral-900 peer-data-[state=checked]:bg-neutral-50 ${
                          plan.popular ? "border-amber-300" : "border-neutral-200"
                        }`}
                      >
                        {plan.popular && (
                          <span className="absolute -top-2 left-4 bg-amber-500 text-white text-xs px-2 py-0.5 rounded">
                            Popolare
                          </span>
                        )}
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold">{plan.name}</span>
                          <span className="text-lg font-bold">
                            €{plan.price}
                            <span className="text-sm font-normal text-neutral-500">/mese</span>
                          </span>
                        </div>
                        <p className="text-sm text-neutral-500 mb-3">{plan.description}</p>
                        <ul className="text-xs space-y-1">
                          {plan.features.map((feature, i) => (
                            <li key={i} className="flex items-center gap-1 text-neutral-600">
                              <Check className="w-3 h-3 text-emerald-500" />
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>

                <div className="mt-6 p-4 bg-neutral-100 rounded-lg">
                  <Label htmlFor="trialDays">Giorni di Trial</Label>
                  <Input
                    id="trialDays"
                    type="number"
                    min={0}
                    max={90}
                    value={form.trialDays}
                    onChange={(e) => updateForm({ trialDays: Number.parseInt(e.target.value) || 0 })}
                    className="mt-2 w-32"
                  />
                  <p className="text-xs text-neutral-500 mt-1">0 = nessun trial, addebito immediato</p>
                </div>
              </CardContent>
            </>
          )}

          {step === 3 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  Amministratore
                </CardTitle>
                <CardDescription>Crea l'utente admin principale per questa struttura</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="adminName">Nome Completo</Label>
                  <Input
                    id="adminName"
                    placeholder="Mario Rossi"
                    value={form.adminName}
                    onChange={(e) => updateForm({ adminName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminEmail">Email</Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    placeholder="admin@hotel.com"
                    value={form.adminEmail}
                    onChange={(e) => updateForm({ adminEmail: e.target.value })}
                  />
                  <p className="text-xs text-neutral-500">Riceverà un invito per impostare la password</p>
                </div>
              </CardContent>
            </>
          )}

          {step === 4 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Moduli Attivi
                </CardTitle>
                <CardDescription>Seleziona i moduli da attivare per questa struttura</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-neutral-400" />
                    <div>
                      <p className="font-medium">CMS</p>
                      <p className="text-sm text-neutral-500">Gestione pagine e contenuti</p>
                    </div>
                  </div>
                  <Checkbox
                    checked={form.cmsEnabled}
                    onCheckedChange={(checked) => updateForm({ cmsEnabled: !!checked })}
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-neutral-400" />
                    <div>
                      <p className="font-medium">Inbox Omnichannel</p>
                      <p className="text-sm text-neutral-500">Email, WhatsApp, Chat, Telegram</p>
                    </div>
                  </div>
                  <Checkbox
                    checked={form.inboxEnabled}
                    onCheckedChange={(checked) => updateForm({ inboxEnabled: !!checked })}
                  />
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Zap className="w-5 h-5 text-neutral-400" />
                    <div>
                      <p className="font-medium">AI Assistant</p>
                      <p className="text-sm text-neutral-500">Risposte automatiche e suggerimenti</p>
                    </div>
                  </div>
                  <Checkbox
                    checked={form.aiEnabled}
                    onCheckedChange={(checked) => updateForm({ aiEnabled: !!checked })}
                  />
                </div>

                {/* Summary */}
                <div className="mt-6 p-4 bg-neutral-900 text-white rounded-lg">
                  <h4 className="font-semibold mb-3">Riepilogo</h4>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <dt className="text-neutral-400">Nome:</dt>
                    <dd>{form.name}</dd>
                    <dt className="text-neutral-400">Slug:</dt>
                    <dd>{form.slug}</dd>
                    <dt className="text-neutral-400">Piano:</dt>
                    <dd className="capitalize">{form.plan}</dd>
                    <dt className="text-neutral-400">Trial:</dt>
                    <dd>{form.trialDays} giorni</dd>
                    <dt className="text-neutral-400">Admin:</dt>
                    <dd>{form.adminEmail}</dd>
                  </dl>
                </div>
              </CardContent>
            </>
          )}
        </Card>

        {/* Error */}
        {error && <div className="mt-4 p-4 bg-red-50 text-red-800 rounded-lg">{error}</div>}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <Button variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Indietro
          </Button>

          {step < 4 ? (
            <Button onClick={() => setStep((s) => Math.min(4, s + 1))} disabled={!canProceed()}>
              Avanti
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={loading || !canProceed()}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {loading ? "Creazione..." : "Crea Tenant"}
              <Check className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
