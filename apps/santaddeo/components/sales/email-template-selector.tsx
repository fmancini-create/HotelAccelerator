"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  BarChart3,
  SlidersHorizontal,
  PiggyBank,
  HeadsetIcon,
  Pencil,
  Sparkles,
  Check,
  X,
  Loader2,
  ChevronRight,
  Video,
  CalendarClock,
  Ban,
  ThumbsUp,
  Rocket,
  PhoneCall,
} from "lucide-react"
import { EMAIL_TEMPLATES, type EmailTemplate } from "@/lib/sales/email-templates"
import { htmlToPlainText, plainTextToHtml } from "@/lib/sales/email-text"
import { CcBccFields } from "@/components/sales/cc-bcc-fields"
import { cn } from "@/lib/utils"

/** Destinatari aggiuntivi opzionali (copia visibile / copia nascosta). */
export type ExtraRecipients = { cc?: string; bcc?: string }

const ICON_MAP = {
  chart: BarChart3,
  sliders: SlidersHorizontal,
  "piggy-bank": PiggyBank,
  headset: HeadsetIcon,
  pencil: Pencil,
  "thumbs-up": ThumbsUp,
  rocket: Rocket,
  "phone-call": PhoneCall,
}

/** Opzione "call" da allegare all'email. */
export type CallOption =
  | { type: "none" }
  | { type: "meet"; startIso: string; endIso: string }
  | { type: "booking"; durationMinutes: number }
  | { type: "propose"; slots: { startIso: string; endIso: string }[]; durationMinutes: number }

type Props = {
  leadData: {
    first_name: string
    last_name: string
    hotel_name: string
    email: string
  }
  /** Nome e cognome del venditore loggato: usato per la firma dell'email. */
  agentName?: string
  /** Email del venditore: usata per il placeholder {{email_venditore}}. */
  agentEmail?: string
  /**
   * Email gia' inviata in precedenza (oggetto + corpo HTML). Se presente, il
   * componente apre DIRETTAMENTE l'editor con questo contenuto per la revisione
   * prima del re-invio, saltando la scelta del template.
   */
  initialSubject?: string | null
  initialBody?: string | null
  onSend: (
    subject: string,
    body: string,
    callOption: CallOption,
    recipients?: ExtraRecipients,
  ) => Promise<void>
  onCancel: () => void
}

export function EmailTemplateSelector({
  leadData,
  agentName,
  agentEmail,
  initialSubject,
  initialBody,
  onSend,
  onCancel,
}: Props) {
  const hasInitial = !!(initialSubject && initialBody)
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null)
  const [editMode, setEditMode] = useState(hasInitial)
  const [subject, setSubject] = useState(initialSubject ?? "")
  const [body, setBody] = useState(initialBody ? htmlToPlainText(initialBody) : "")
  const [aiGenerating, setAiGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  // Destinatari aggiuntivi opzionali (copia visibile / copia nascosta).
  const [cc, setCc] = useState("")
  const [bcc, setBcc] = useState("")

  // Opzione "call": nessuna / link Meet diretto / form di prenotazione.
  const [callKind, setCallKind] = useState<"none" | "meet" | "booking">("none")
  const [meetDate, setMeetDate] = useState("") // yyyy-mm-dd
  const [meetTime, setMeetTime] = useState("10:00")
  const [callDuration, setCallDuration] = useState(30)
  const [callError, setCallError] = useState<string | null>(null)

  function selectTemplate(tpl: EmailTemplate) {
    setSelectedTemplate(tpl)
    // Sostituisci i placeholder base. Il corpo viene mostrato come TESTO
    // semplice (i venditori non scrivono HTML): convertiamo il template HTML
    // in testo leggibile e lo riconvertiamo in HTML solo all'invio.
    const filledSubject = replacePlaceholders(tpl.subject, leadData)
    const filledBody = replacePlaceholders(tpl.body, leadData)
    setSubject(filledSubject)
    setBody(htmlToPlainText(filledBody))
    setEditMode(true)
  }

  function replacePlaceholders(text: string, data: Props["leadData"]) {
    // La firma è SEMPRE il nome e cognome del venditore loggato (mai
    // "Staff/Team SANTADDEO"). Se il nome non è disponibile lato client lo
    // lasciamo come placeholder: verrà risolto lato server prima dell'invio.
    return text
      .replace(/\{\{nome_lead\}\}/g, data.first_name)
      .replace(/\{\{cognome_lead\}\}/g, data.last_name)
      .replace(/\{\{nome_struttura\}\}/g, data.hotel_name)
      .replace(/\{\{nome_venditore\}\}/g, agentName?.trim() || "{{nome_venditore}}")
      .replace(/\{\{email_venditore\}\}/g, agentEmail?.trim() || "{{email_venditore}}")
      .replace(/\{\{link_signup\}\}/g, "https://www.santaddeo.com/auth/sign-up")
      .replace(/\{\{link_dashboard_demo\}\}/g, "https://www.santaddeo.com/landing/dashboard-gratuita")
  }

  async function generateWithAI() {
    if (!selectedTemplate) return
    setAiGenerating(true)
    try {
      const res = await fetch("/api/sales/leads/generate-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template_id: selectedTemplate.id,
          lead: leadData,
        }),
      })
      const data = await res.json()
      if (res.ok && data.subject && data.body) {
        setSubject(data.subject)
        // L'AI puo' restituire HTML: mostralo come testo nell'editor.
        setBody(htmlToPlainText(data.body))
      }
    } catch (e) {
      console.error("AI generation failed", e)
    } finally {
      setAiGenerating(false)
    }
  }

  async function handleSend() {
    // Costruisci e valida la call option scelta.
    let callOption: CallOption = { type: "none" }
    if (callKind === "meet") {
      if (!meetDate || !meetTime) {
        setCallError("Seleziona data e ora della call.")
        return
      }
      const start = new Date(`${meetDate}T${meetTime}:00`)
      if (isNaN(start.getTime())) {
        setCallError("Data o ora non valide.")
        return
      }
      if (start.getTime() <= Date.now()) {
        setCallError("Scegli una data e ora future.")
        return
      }
      const end = new Date(start.getTime() + callDuration * 60 * 1000)
      callOption = { type: "meet", startIso: start.toISOString(), endIso: end.toISOString() }
    } else if (callKind === "booking") {
      callOption = { type: "booking", durationMinutes: callDuration }
    }
    setCallError(null)

    setSending(true)
    try {
      // L'editor lavora in testo semplice: converti in HTML email-safe prima
      // di inviare.
      await onSend(subject, plainTextToHtml(body), callOption, { cc, bcc })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Template Cards — nascosti in modalità revisione (re-invio) */}
      {!hasInitial && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Scegli un tema per l&apos;email</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Ogni template mette in evidenza un punto di forza di SANTADDEO. Puoi personalizzarlo dopo.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {EMAIL_TEMPLATES.map((tpl) => {
              const Icon = ICON_MAP[tpl.icon]
              const isSelected = selectedTemplate?.id === tpl.id
              return (
                <Card
                  key={tpl.id}
                  className={cn(
                    "relative overflow-hidden cursor-pointer transition-all hover:shadow-md",
                    isSelected && "ring-2 ring-primary"
                  )}
                  onClick={() => selectTemplate(tpl)}
                >
                  {/* Color bar top */}
                  <div className={cn("h-1.5", tpl.color)} />

                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn("p-2.5 rounded-lg", tpl.color, "bg-opacity-10")}>
                        <Icon className={cn("h-5 w-5", tpl.color.replace("bg-", "text-"))} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-sm">{tpl.name}</h4>
                          {isSelected && (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0">
                              <Check className="h-3 w-3 mr-0.5" /> Selezionato
                            </Badge>
                          )}
                        </div>
                        <p className={cn("text-xs font-medium mt-0.5", tpl.color.replace("bg-", "text-"))}>
                          {tpl.tagline}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                          {tpl.description}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Editor Dialog */}
      <Dialog
        open={editMode}
        onOpenChange={(open) => {
          setEditMode(open)
          // In modalità revisione (re-invio) non c'è una griglia template
          // dietro: chiudere l'editor equivale ad annullare.
          if (!open && hasInitial) onCancel()
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTemplate ? (
                <>
                  {(() => {
                    const Icon = ICON_MAP[selectedTemplate.icon]
                    return <Icon className={cn("h-5 w-5", selectedTemplate.color.replace("bg-", "text-"))} />
                  })()}
                  {selectedTemplate.name}
                </>
              ) : (
                <>
                  <Pencil className="h-5 w-5 text-muted-foreground" />
                  Rivedi l&apos;email
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {hasInitial
                ? `Controlla il testo già inviato e re-invialo a ${leadData.first_name} ${leadData.last_name}`
                : `Personalizza l'email prima di inviarla a ${leadData.first_name} ${leadData.last_name}`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            {/* AI Button — solo se c'è un template selezionato */}
            {selectedTemplate && (
              <Button
                variant="outline"
                size="sm"
                onClick={generateWithAI}
                disabled={aiGenerating}
                className="w-full border-dashed"
              >
                {aiGenerating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2 text-amber-500" />
                )}
                {aiGenerating ? "Generazione in corso..." : "Genera con AI (personalizzato)"}
              </Button>
            )}

            {/* Subject */}
            <div>
              <Label htmlFor="email-subject">Oggetto</Label>
              <Input
                id="email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1"
              />
              <CcBccFields
                cc={cc}
                bcc={bcc}
                onCcChange={setCc}
                onBccChange={setBcc}
                disabled={sending}
                className="mt-2"
              />
            </div>

            {/* Body */}
            <div>
              <Label htmlFor="email-body">Corpo email</Label>
              <Textarea
                id="email-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                className="mt-1 text-sm leading-relaxed"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Scrivi come una normale email. Vai a capo per separare i
                paragrafi e inizia una riga con &quot;- &quot; per fare un
                elenco. La formattazione viene applicata automaticamente.
              </p>
            </div>

            {/* Call option */}
            <div className="rounded-md border p-4">
              <Label className="text-sm font-semibold">Aggiungi una call (opzionale)</Label>
              <p className="mt-1 mb-3 text-xs text-muted-foreground">
                Inserisci un link diretto a una videocall Google Meet, oppure lascia che il lead
                prenoti da solo uno slot libero dal calendario.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { key: "none" as const, label: "Nessuna", icon: Ban },
                  { key: "meet" as const, label: "Link Meet diretto", icon: Video },
                  { key: "booking" as const, label: "Form di prenotazione", icon: CalendarClock },
                ].map((opt) => {
                  const Icon = opt.icon
                  const active = callKind === opt.key
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        setCallKind(opt.key)
                        setCallError(null)
                      }}
                      className={cn(
                        "flex items-center gap-2 rounded-md border p-2.5 text-left text-xs transition-colors",
                        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted",
                      )}
                    >
                      <Icon className={cn("h-4 w-4 flex-shrink-0", active && "text-primary")} />
                      <span className="font-medium">{opt.label}</span>
                    </button>
                  )
                })}
              </div>

              {callKind === "meet" && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="meet-date" className="text-xs">
                      Data
                    </Label>
                    <Input
                      id="meet-date"
                      type="date"
                      value={meetDate}
                      onChange={(e) => setMeetDate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="meet-time" className="text-xs">
                      Ora
                    </Label>
                    <Input
                      id="meet-time"
                      type="time"
                      value={meetTime}
                      onChange={(e) => setMeetTime(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="meet-duration" className="text-xs">
                      Durata (min)
                    </Label>
                    <Input
                      id="meet-duration"
                      type="number"
                      min={15}
                      step={15}
                      value={callDuration}
                      onChange={(e) => setCallDuration(Number(e.target.value) || 30)}
                      className="mt-1"
                    />
                  </div>
                  <p className="sm:col-span-3 text-xs text-muted-foreground">
                    Verrà creata una richiesta &quot;da confermare&quot;: il link Meet viene inserito
                    nell&apos;email e l&apos;evento appare sul calendario in attesa di approvazione.
                  </p>
                </div>
              )}

              {callKind === "booking" && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="booking-duration" className="text-xs">
                      Durata call (min)
                    </Label>
                    <Input
                      id="booking-duration"
                      type="number"
                      min={15}
                      step={15}
                      value={callDuration}
                      onChange={(e) => setCallDuration(Number(e.target.value) || 30)}
                      className="mt-1"
                    />
                  </div>
                  <p className="sm:col-span-2 text-xs text-muted-foreground">
                    L&apos;email conterrà un pulsante per prenotare la call. Il lead sceglierà uno
                    slot libero dal calendario e la richiesta resterà &quot;da confermare&quot;.
                  </p>
                </div>
              )}

              {callError && <p className="mt-2 text-xs text-destructive">{callError}</p>}
            </div>

            {/* Preview */}
            <div>
              <Label className="text-muted-foreground">Anteprima</Label>
              <div
                className="mt-1 border rounded-md p-4 bg-white text-sm prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: plainTextToHtml(body) }}
              />
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setEditMode(false)} disabled={sending}>
              <X className="h-4 w-4 mr-1" /> Annulla
            </Button>
            <Button onClick={handleSend} disabled={sending || !subject || !body}>
              {sending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              {sending ? "Invio..." : "Invia email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bottom actions — nascoste in modalità revisione (re-invio) */}
      {!hasInitial && (
        <div className="flex justify-end gap-3 pt-2 border-t">
          <Button variant="ghost" onClick={onCancel}>
            Annulla
          </Button>
          <Button
            disabled={!selectedTemplate}
            onClick={() => selectedTemplate && setEditMode(true)}
          >
            Continua con il template selezionato
          </Button>
        </div>
      )}
    </div>
  )
}
