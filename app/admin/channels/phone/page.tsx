"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Phone, Clock, FileText, Bot, Bell, CheckCircle2 } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"

export default function PhoneChannelPage() {
  return (
    <div className="min-h-screen bg-background">
      <AdminHeader
        title="Telefono IP"
        subtitle="Gestione chiamate con trascrizione AI"
        breadcrumbs={[{ label: "Canali", href: "/admin/channels" }, { label: "Telefono IP" }]}
      >
        <Badge variant="secondary">Prossimamente</Badge>
      </AdminHeader>

      <div className="container py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Coming Soon Card */}
          <Card className="border-amber-200 dark:border-amber-800">
            <CardHeader className="text-center pb-2">
              <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center mx-auto mb-4">
                <Phone className="h-10 w-10 text-amber-500" />
              </div>
              <CardTitle className="text-2xl">Telefonia IP in arrivo</CardTitle>
              <CardDescription className="text-base">
                Stiamo lavorando per portarti la gestione completa delle chiamate con trascrizione automatica e
                assistente AI
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 mt-4">
                <h4 className="font-medium text-center mb-4">Cosa potrai fare:</h4>

                <div className="grid gap-3">
                  {[
                    {
                      icon: FileText,
                      title: "Trascrizione automatica",
                      desc: "Ogni chiamata verrà trascritta automaticamente e salvata nella conversazione",
                    },
                    {
                      icon: Bot,
                      title: "Assistente AI vocale",
                      desc: "Attiva l'AI per rispondere alle chiamate quando non sei disponibile",
                    },
                    {
                      icon: Clock,
                      title: "Orari personalizzati",
                      desc: "Configura quando l'AI deve rispondere e quando passare a un operatore",
                    },
                    {
                      icon: Bell,
                      title: "Notifiche smart",
                      desc: "Ricevi notifiche per chiamate perse e richieste urgenti",
                    },
                  ].map((feature, i) => (
                    <div key={i} className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                      <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center shrink-0">
                        <feature.icon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <h5 className="font-medium">{feature.title}</h5>
                        <p className="text-sm text-muted-foreground">{feature.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t pt-6 mt-6">
                  <div className="text-center space-y-4">
                    <p className="text-sm text-muted-foreground">Vuoi essere avvisato quando sarà disponibile?</p>
                    <div className="flex justify-center gap-2">
                      <Button variant="outline">
                        <Bell className="h-4 w-4 mr-2" />
                        Avvisami al lancio
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Integration info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Integrazioni previste</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {["Twilio", "Vonage", "Asterisk", "3CX"].map((provider) => (
                  <div key={provider} className="flex items-center gap-2 p-3 rounded-lg border">
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{provider}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
