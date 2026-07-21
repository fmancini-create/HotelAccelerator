"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Copy, Check } from "lucide-react"

export default function EmailTemplatesPage() {
  const [copiedTemplate, setCopiedTemplate] = useState<string | null>(null)

  const copyToClipboard = (template: string, templateName: string) => {
    navigator.clipboard.writeText(template)
    setCopiedTemplate(templateName)
    setTimeout(() => setCopiedTemplate(null), 2000)
  }

  const resetPasswordTemplate = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Password - SANTADDEO</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; border-bottom: 1px solid #e5e5e5;">
              <img src="{{ .SiteURL }}/logo-santaddeo.png" alt="SANTADDEO" style="width: 180px; height: auto;">
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 600; color: #1a1a1a;">Reset della Password</h1>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #525252;">Hai richiesto di reimpostare la tua password per SANTADDEO.</p>
              <p style="margin: 0 0 30px; font-size: 16px; line-height: 1.6; color: #525252;">Clicca sul pulsante qui sotto per creare una nuova password:</p>
              
              <table role="presentation" style="margin: 0 auto;">
                <tr>
                  <td style="border-radius: 6px; background-color: #1a1a1a;">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none;">Reimposta Password</a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; font-size: 14px; line-height: 1.6; color: #737373;">Se non hai richiesto questa modifica, puoi ignorare questa email. La tua password rimarrà invariata.</p>
              <p style="margin: 20px 0 0; font-size: 14px; line-height: 1.6; color: #737373;">Questo link scadrà tra 24 ore.</p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #fafafa; border-top: 1px solid #e5e5e5;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td style="text-align: center; padding-bottom: 20px;">
                    <p style="margin: 0 0 10px; font-size: 12px; color: #737373;">Powered by</p>
                    <img src="{{ .SiteURL }}/logo-4bid.png" alt="4 BID S.r.l." style="width: 100px; height: auto; opacity: 0.8;">
                  </td>
                </tr>
                <tr>
                  <td style="text-align: center;">
                    <p style="margin: 0 0 5px; font-size: 13px; font-weight: 600; color: #525252;">4 BID S.r.l.</p>
                    <p style="margin: 0 0 3px; font-size: 12px; color: #737373;">Via Sorripa, 10 – 50026 – San Casciano in Val di Pesa (FI)</p>
                    <p style="margin: 0 0 10px; font-size: 12px; color: #737373;">P.I. 06241710489</p>
                    <p style="margin: 0; font-size: 11px; color: #a3a3a3;">© 2025 4 BID S.r.l. Tutti i diritti riservati.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const confirmEmailTemplate = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conferma Email - SANTADDEO</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; border-bottom: 1px solid #e5e5e5;">
              <img src="{{ .SiteURL }}/logo-santaddeo.png" alt="SANTADDEO" style="width: 180px; height: auto;">
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 600; color: #1a1a1a;">Benvenuto in SANTADDEO!</h1>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #525252;">Grazie per esserti registrato. Per completare la registrazione, conferma il tuo indirizzo email.</p>
              <p style="margin: 0 0 30px; font-size: 16px; line-height: 1.6; color: #525252;">Clicca sul pulsante qui sotto per verificare la tua email:</p>
              
              <table role="presentation" style="margin: 0 auto;">
                <tr>
                  <td style="border-radius: 6px; background-color: #1a1a1a;">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none;">Conferma Email</a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; font-size: 14px; line-height: 1.6; color: #737373;">Se non hai creato un account, puoi ignorare questa email.</p>
              <p style="margin: 20px 0 0; font-size: 14px; line-height: 1.6; color: #737373;">Questo link scadrà tra 24 ore.</p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #fafafa; border-top: 1px solid #e5e5e5;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td style="text-align: center; padding-bottom: 20px;">
                    <p style="margin: 0 0 10px; font-size: 12px; color: #737373;">Powered by</p>
                    <img src="{{ .SiteURL }}/logo-4bid.png" alt="4 BID S.r.l." style="width: 100px; height: auto; opacity: 0.8;">
                  </td>
                </tr>
                <tr>
                  <td style="text-align: center;">
                    <p style="margin: 0 0 5px; font-size: 13px; font-weight: 600; color: #525252;">4 BID S.r.l.</p>
                    <p style="margin: 0 0 3px; font-size: 12px; color: #737373;">Via Sorripa, 10 – 50026 – San Casciano in Val di Pesa (FI)</p>
                    <p style="margin: 0 0 10px; font-size: 12px; color: #737373;">P.I. 06241710489</p>
                    <p style="margin: 0; font-size: 11px; color: #a3a3a3;">© 2025 4 BID S.r.l. Tutti i diritti riservati.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const magicLinkTemplate = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accesso a SANTADDEO</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; border-bottom: 1px solid #e5e5e5;">
              <img src="{{ .SiteURL }}/logo-santaddeo.png" alt="SANTADDEO" style="width: 180px; height: auto;">
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 600; color: #1a1a1a;">Accedi a SANTADDEO</h1>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #525252;">Clicca sul pulsante qui sotto per accedere al tuo account:</p>
              
              <table role="presentation" style="margin: 0 auto;">
                <tr>
                  <td style="border-radius: 6px; background-color: #1a1a1a;">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none;">Accedi</a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; font-size: 14px; line-height: 1.6; color: #737373;">Se non hai richiesto questo accesso, puoi ignorare questa email.</p>
              <p style="margin: 20px 0 0; font-size: 14px; line-height: 1.6; color: #737373;">Questo link scadrà tra 1 ora.</p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #fafafa; border-top: 1px solid #e5e5e5;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td style="text-align: center; padding-bottom: 20px;">
                    <p style="margin: 0 0 10px; font-size: 12px; color: #737373;">Powered by</p>
                    <img src="{{ .SiteURL }}/logo-4bid.png" alt="4 BID S.r.l." style="width: 100px; height: auto; opacity: 0.8;">
                  </td>
                </tr>
                <tr>
                  <td style="text-align: center;">
                    <p style="margin: 0 0 5px; font-size: 13px; font-weight: 600; color: #525252;">4 BID S.r.l.</p>
                    <p style="margin: 0 0 3px; font-size: 12px; color: #737373;">Via Sorripa, 10 – 50026 – San Casciano in Val di Pesa (FI)</p>
                    <p style="margin: 0 0 10px; font-size: 12px; color: #737373;">P.I. 06241710489</p>
                    <p style="margin: 0; font-size: 11px; color: #a3a3a3;">© 2025 4 BID S.r.l. Tutti i diritti riservati.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Template Email SANTADDEO</h1>
        <p className="text-muted-foreground">
          Template HTML personalizzati per le comunicazioni email di Supabase Auth
        </p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Come Configurare i Template</CardTitle>
          <CardDescription>Segui questi passaggi per applicare i template personalizzati in Supabase</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold">1. Accedi al Dashboard di Supabase</h3>
            <p className="text-sm text-muted-foreground">
              Vai su{" "}
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                supabase.com/dashboard
              </a>{" "}
              e seleziona il tuo progetto
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold">2. Vai su Authentication → Email Templates</h3>
            <p className="text-sm text-muted-foreground">
              Nel menu laterale, clicca su "Authentication" e poi su "Email Templates"
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold">3. Seleziona il Template da Modificare</h3>
            <p className="text-sm text-muted-foreground">
              Scegli tra: Confirm signup, Magic Link, Change Email Address, Reset Password
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold">4. Copia e Incolla il Template HTML</h3>
            <p className="text-sm text-muted-foreground">
              Usa i pulsanti "Copia" qui sotto per copiare il template corrispondente e incollalo nel campo "Message
              (HTML)"
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold">5. Salva le Modifiche</h3>
            <p className="text-sm text-muted-foreground">Clicca su "Save" per applicare il nuovo template</p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="reset-password" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="reset-password">Reset Password</TabsTrigger>
          <TabsTrigger value="confirm-email">Conferma Email</TabsTrigger>
          <TabsTrigger value="magic-link">Magic Link</TabsTrigger>
        </TabsList>

        <TabsContent value="reset-password" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Template Reset Password</CardTitle>
                  <CardDescription>Usato quando un utente richiede di reimpostare la password</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(resetPasswordTemplate, "reset-password")}
                >
                  {copiedTemplate === "reset-password" ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copiato!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copia Template
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-xs">
                <code>{resetPasswordTemplate}</code>
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="confirm-email" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Template Conferma Email</CardTitle>
                  <CardDescription>Usato quando un nuovo utente si registra</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(confirmEmailTemplate, "confirm-email")}
                >
                  {copiedTemplate === "confirm-email" ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copiato!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copia Template
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-xs">
                <code>{confirmEmailTemplate}</code>
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="magic-link" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Template Magic Link</CardTitle>
                  <CardDescription>Usato per l'accesso senza password tramite email</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(magicLinkTemplate, "magic-link")}>
                  {copiedTemplate === "magic-link" ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copiato!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copia Template
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-xs">
                <code>{magicLinkTemplate}</code>
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Note Importanti</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            • I template utilizzano le variabili di Supabase come{" "}
            <code className="bg-gray-100 px-1 rounded">{`{{ .ConfirmationURL }}`}</code> e{" "}
            <code className="bg-gray-100 px-1 rounded">{`{{ .SiteURL }}`}</code> che vengono automaticamente sostituite
          </p>
          <p>
            • Assicurati che i loghi <code className="bg-gray-100 px-1 rounded">/logo-santaddeo.png</code> e{" "}
            <code className="bg-gray-100 px-1 rounded">/logo-4bid.png</code> siano accessibili pubblicamente
          </p>
          <p>• I template sono responsive e ottimizzati per tutti i client email</p>
          <p>• Puoi personalizzare ulteriormente i colori e il testo secondo le tue esigenze</p>
        </CardContent>
      </Card>
    </div>
  )
}
