"use client"

import { useState, useEffect } from "react"
import { Save, Globe, Mail, Bell, Shield, Database, Key } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"

export default function SuperAdminSettingsPage() {
  const [isSaving, setIsSaving] = useState(false)
  const [userEmail, setUserEmail] = useState("")

  // Platform settings state
  const [platformSettings, setPlatformSettings] = useState({
    platformName: "HotelAccelerator",
    supportEmail: "support@hotelaccelerator.com",
    defaultLanguage: "it",
    maintenanceMode: false,
    allowNewRegistrations: true,
    requireEmailVerification: true,
    maxTenantsPerPlan: {
      starter: 1,
      professional: 5,
      enterprise: -1, // unlimited
    },
  })

  // Notification settings
  const [notifications, setNotifications] = useState({
    emailOnNewTenant: true,
    emailOnPaymentFailed: true,
    emailOnSupportRequest: true,
    slackIntegration: false,
    slackWebhook: "",
  })

  useEffect(() => {
    const loadUser = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user?.email) setUserEmail(user.email)
    }
    loadUser()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    // TODO: Save settings to database
    await new Promise((r) => setTimeout(r, 1000))
    setIsSaving(false)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900">Impostazioni Piattaforma</h1>
        <p className="text-neutral-600 mt-1">Configura le impostazioni globali di HotelAccelerator</p>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="bg-neutral-100">
          <TabsTrigger value="general" className="gap-2">
            <Globe className="w-4 h-4" />
            Generali
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="w-4 h-4" />
            Notifiche
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="w-4 h-4" />
            Sicurezza
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-2">
            <Key className="w-4 h-4" />
            API
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Impostazioni Generali</CardTitle>
              <CardDescription>Configura le impostazioni base della piattaforma</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="platformName">Nome Piattaforma</Label>
                  <Input
                    id="platformName"
                    value={platformSettings.platformName}
                    onChange={(e) => setPlatformSettings((s) => ({ ...s, platformName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supportEmail">Email Supporto</Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    value={platformSettings.supportEmail}
                    onChange={(e) => setPlatformSettings((s) => ({ ...s, supportEmail: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="defaultLanguage">Lingua Default</Label>
                <select
                  id="defaultLanguage"
                  className="w-full h-10 px-3 rounded-md border border-neutral-200 bg-white"
                  value={platformSettings.defaultLanguage}
                  onChange={(e) => setPlatformSettings((s) => ({ ...s, defaultLanguage: e.target.value }))}
                >
                  <option value="it">Italiano</option>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                  <option value="fr">Français</option>
                </select>
              </div>

              <div className="border-t pt-6 space-y-4">
                <h3 className="font-medium text-neutral-900">Modalità Piattaforma</h3>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Modalità Manutenzione</Label>
                    <p className="text-sm text-neutral-500">Blocca l'accesso ai tenant durante la manutenzione</p>
                  </div>
                  <Switch
                    checked={platformSettings.maintenanceMode}
                    onCheckedChange={(checked) => setPlatformSettings((s) => ({ ...s, maintenanceMode: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Permetti Nuove Registrazioni</Label>
                    <p className="text-sm text-neutral-500">Consenti la creazione di nuovi tenant</p>
                  </div>
                  <Switch
                    checked={platformSettings.allowNewRegistrations}
                    onCheckedChange={(checked) =>
                      setPlatformSettings((s) => ({ ...s, allowNewRegistrations: checked }))
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notification Settings */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notifiche</CardTitle>
              <CardDescription>Configura come ricevere le notifiche della piattaforma</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="font-medium text-neutral-900 flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Notifiche Email
                </h3>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Nuovo Tenant Registrato</Label>
                    <p className="text-sm text-neutral-500">Ricevi email quando si registra un nuovo tenant</p>
                  </div>
                  <Switch
                    checked={notifications.emailOnNewTenant}
                    onCheckedChange={(checked) => setNotifications((n) => ({ ...n, emailOnNewTenant: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Pagamento Fallito</Label>
                    <p className="text-sm text-neutral-500">Notifica quando un pagamento fallisce</p>
                  </div>
                  <Switch
                    checked={notifications.emailOnPaymentFailed}
                    onCheckedChange={(checked) => setNotifications((n) => ({ ...n, emailOnPaymentFailed: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Richieste Supporto</Label>
                    <p className="text-sm text-neutral-500">Notifica per nuove richieste di supporto</p>
                  </div>
                  <Switch
                    checked={notifications.emailOnSupportRequest}
                    onCheckedChange={(checked) => setNotifications((n) => ({ ...n, emailOnSupportRequest: checked }))}
                  />
                </div>
              </div>

              <div className="border-t pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Integrazione Slack</Label>
                    <p className="text-sm text-neutral-500">Invia notifiche a un canale Slack</p>
                  </div>
                  <Switch
                    checked={notifications.slackIntegration}
                    onCheckedChange={(checked) => setNotifications((n) => ({ ...n, slackIntegration: checked }))}
                  />
                </div>

                {notifications.slackIntegration && (
                  <div className="space-y-2">
                    <Label htmlFor="slackWebhook">Slack Webhook URL</Label>
                    <Input
                      id="slackWebhook"
                      placeholder="https://hooks.slack.com/services/..."
                      value={notifications.slackWebhook}
                      onChange={(e) => setNotifications((n) => ({ ...n, slackWebhook: e.target.value }))}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Sicurezza</CardTitle>
              <CardDescription>Impostazioni di sicurezza della piattaforma</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Verifica Email Obbligatoria</Label>
                  <p className="text-sm text-neutral-500">Richiedi verifica email per nuovi utenti</p>
                </div>
                <Switch
                  checked={platformSettings.requireEmailVerification}
                  onCheckedChange={(checked) =>
                    setPlatformSettings((s) => ({ ...s, requireEmailVerification: checked }))
                  }
                />
              </div>

              <div className="border-t pt-6">
                <h3 className="font-medium text-neutral-900 mb-4">Account Super Admin</h3>
                <div className="bg-neutral-50 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center">
                      <span className="text-sm font-medium">SA</span>
                    </div>
                    <div>
                      <p className="font-medium text-neutral-900">{userEmail}</p>
                      <p className="text-sm text-neutral-500">Super Admin</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6 space-y-4">
                <h3 className="font-medium text-neutral-900">Cambio Password</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Password Attuale</Label>
                    <Input id="currentPassword" type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">Nuova Password</Label>
                    <Input id="newPassword" type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Conferma Password</Label>
                    <Input id="confirmPassword" type="password" />
                  </div>
                  <Button variant="outline">Aggiorna Password</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Settings */}
        <TabsContent value="api">
          <Card>
            <CardHeader>
              <CardTitle>API & Integrazioni</CardTitle>
              <CardDescription>Gestisci le chiavi API e le integrazioni esterne</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <Database className="w-5 h-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-900">Database Connesso</p>
                  <p className="text-sm text-amber-700">Supabase PostgreSQL</p>
                </div>
              </div>

              <div className="border-t pt-6 space-y-4">
                <h3 className="font-medium text-neutral-900">Chiavi API</h3>
                <p className="text-sm text-neutral-500">
                  Le chiavi API permettono integrazioni esterne con la piattaforma.
                </p>

                <div className="space-y-2">
                  <Label>API Key (Produzione)</Label>
                  <div className="flex gap-2">
                    <Input readOnly value="ha_live_••••••••••••••••" className="font-mono bg-neutral-50" />
                    <Button variant="outline">Rigenera</Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>API Key (Test)</Label>
                  <div className="flex gap-2">
                    <Input readOnly value="ha_test_••••••••••••••••" className="font-mono bg-neutral-50" />
                    <Button variant="outline">Rigenera</Button>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="font-medium text-neutral-900 mb-4">Webhook URL</h3>
                <div className="space-y-2">
                  <Label htmlFor="webhookUrl">Endpoint per eventi</Label>
                  <Textarea id="webhookUrl" placeholder="https://your-server.com/webhook" rows={2} />
                  <p className="text-xs text-neutral-500">
                    Riceverai eventi come: tenant.created, payment.completed, user.registered
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? "Salvataggio..." : "Salva Impostazioni"}
        </Button>
      </div>
    </div>
  )
}
