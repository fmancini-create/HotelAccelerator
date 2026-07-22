"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Building2,
  Hotel,
  Pencil,
  Plus,
  Trash2,
  Send,
  Copy,
  ExternalLink,
  CheckCircle2,
  Mail,
  MailX,
} from "lucide-react"

interface Organization {
  id: string
  name: string
  type: string
  company_name: string | null
  vat_number: string | null
  created_at: string
}

interface HotelItem {
  id: string
  organization_id: string
  name: string
  total_rooms: number
  city: string | null
  created_at: string
}

interface EditForm {
  name: string
  type: string
  company_name: string
  vat_number: string
}

export function OrganizationsManager({
  organizations: initialOrganizations,
  hotels,
}: {
  organizations: Organization[]
  hotels: HotelItem[]
}) {
  const [organizations, setOrganizations] = useState<Organization[]>(initialOrganizations)
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [deletingOrg, setDeletingOrg] = useState<Organization | null>(null)
  const [creatingOrg, setCreatingOrg] = useState(false)
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    type: "hotel",
    company_name: "",
    vat_number: "",
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Force onboarding (12/05/2026): per riportare nel flusso un'organization
  // creata in signup ma mai completata in onboarding (caso "Nunia in Rome").
  const [forcingOrg, setForcingOrg] = useState<Organization | null>(null)
  const [forcingLoading, setForcingLoading] = useState(false)
  const [forcingResult, setForcingResult] = useState<{
    organization: { id: string; name: string }
    affectedUsers: number
    emailsSent: number
    message?: string
    links: Array<{
      email: string
      userId: string
      magicLink: string | null
      emailSent: boolean
      error?: string
    }>
  } | null>(null)
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)

  const getHotelsForOrg = (orgId: string) => hotels.filter((h) => h.organization_id === orgId)

  async function handleForceOnboarding(org: Organization) {
    setForcingLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/superadmin/organizations/${org.id}/force-onboarding`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Errore durante il force onboarding")
        setForcingOrg(null)
        return
      }
      setForcingResult(data)
      setForcingOrg(null)
    } catch {
      setError("Errore di connessione")
      setForcingOrg(null)
    } finally {
      setForcingLoading(false)
    }
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedLinkId(id)
      setTimeout(() => setCopiedLinkId(null), 2000)
    })
  }

  function openCreate() {
    setEditForm({
      name: "",
      type: "hotel",
      company_name: "",
      vat_number: "",
    })
    setCreatingOrg(true)
    setError(null)
  }

  async function handleCreate() {
    if (!editForm.name.trim()) {
      setError("Il nome e obbligatorio")
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch("/api/superadmin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          type: editForm.type,
          company_name: editForm.company_name.trim() || null,
          vat_number: editForm.vat_number.trim() || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Errore durante la creazione")
        return
      }

      setOrganizations((prev) => [...prev, data.organization])
      setCreatingOrg(false)
    } catch {
      setError("Errore di connessione")
    } finally {
      setSaving(false)
    }
  }

  function openEdit(org: Organization) {
    setEditForm({
      name: org.name,
      type: org.type,
      company_name: org.company_name || "",
      vat_number: org.vat_number || "",
    })
    setEditingOrg(org)
    setError(null)
  }

  async function handleSave() {
    if (!editingOrg) return
    if (!editForm.name.trim()) {
      setError("Il nome e obbligatorio")
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/superadmin/organizations/${editingOrg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          type: editForm.type,
          company_name: editForm.company_name.trim() || null,
          vat_number: editForm.vat_number.trim() || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Errore durante il salvataggio")
        return
      }

      // Update local state
      setOrganizations((prev) =>
        prev.map((o) => (o.id === editingOrg.id ? { ...o, ...data.organization } : o))
      )
      setEditingOrg(null)
    } catch {
      setError("Errore di connessione")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deletingOrg) return

    setDeleting(true)
    setError(null)

    try {
      const res = await fetch(`/api/superadmin/organizations/${deletingOrg.id}`, {
        method: "DELETE",
      })

      const data = await res.json()

      if (!res.ok) {
        // Keep dialog open so user sees the error
        setError(data.error || "Errore durante l'eliminazione")
        setDeleting(false)
        return
      }

      // Remove from local state
      setOrganizations((prev) => prev.filter((o) => o.id !== deletingOrg.id))
      setDeletingOrg(null)
    } catch {
      setError("Errore di connessione")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && !editingOrg && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Organizzazioni e Strutture</CardTitle>
            <CardDescription>
              Gestisci le anagrafiche aziendali e le strutture associate. Ogni organizzazione puo
              avere una o piu strutture.
            </CardDescription>
          </div>
          <Button onClick={openCreate} size="sm" className="shrink-0">
            <Plus className="h-4 w-4 mr-1" />
            Nuova Organizzazione
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {organizations.map((org) => {
              const orgHotels = getHotelsForOrg(org.id)
              const totalRooms = orgHotels.reduce((sum, h) => sum + h.total_rooms, 0)

              return (
                <div key={org.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-blue-600" />
                      <div>
                        <div className="font-semibold text-lg">{org.name}</div>
                        {org.company_name && (
                          <div className="text-sm text-muted-foreground">{org.company_name}</div>
                        )}
                        <div className="text-sm text-muted-foreground">
                          {org.vat_number && <span>P.IVA: {org.vat_number} - </span>}
                          {orgHotels.length}{" "}
                          {orgHotels.length === 1 ? "struttura" : "strutture"} - {totalRooms}{" "}
                          camere totali
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {org.type === "consultant" ? "Consulente RM" : "Azienda Alberghiera"}
                      </Badge>
                      {orgHotels.length === 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100"
                          onClick={() => {
                            setError(null)
                            setForcingOrg(org)
                          }}
                          title="Reinstrada gli utenti di questa organizzazione al flusso di onboarding per completare l'anagrafica"
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Forza onboarding
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => openEdit(org)}>
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Modifica</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          setError(null)
                          setDeletingOrg(org)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Elimina</span>
                      </Button>
                    </div>
                  </div>

                  {orgHotels.length > 0 && (
                    <div className="ml-8 space-y-2">
                      {orgHotels.map((hotel) => (
                        <div
                          key={hotel.id}
                          className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
                        >
                          <Hotel className="h-4 w-4 text-green-600" />
                          <div className="flex-1">
                            <div className="font-medium">{hotel.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {hotel.city || "N/A"} - {hotel.total_rooms} camere
                            </div>
                          </div>
                          <Badge variant="secondary">{hotel.total_rooms} camere</Badge>
                        </div>
                      ))}
                    </div>
                  )}

                  {orgHotels.length === 0 && (
                    <div className="ml-8 text-sm text-muted-foreground italic p-3 bg-muted/30 rounded-lg">
                      Nessuna struttura associata
                    </div>
                  )}
                </div>
              )
            })}

            {organizations.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                Nessuna organizzazione nel sistema
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingOrg} onOpenChange={(open) => !open && setEditingOrg(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifica Organizzazione</DialogTitle>
            <DialogDescription>
              Aggiorna i dati anagrafici dell{"'"}organizzazione.
            </DialogDescription>
          </DialogHeader>

          {error && editingOrg && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Nome organizzazione *</Label>
              <Input
                id="org-name"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="es. Villa I Barronci Resort & Spa"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="org-type">Tipo</Label>
              <Select
                value={editForm.type}
                onValueChange={(v) => setEditForm((f) => ({ ...f, type: v }))}
              >
                <SelectTrigger id="org-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hotel">Azienda Alberghiera</SelectItem>
                  <SelectItem value="consultant">Consulente Revenue Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="org-company">Ragione sociale</Label>
              <Input
                id="org-company"
                value={editForm.company_name}
                onChange={(e) => setEditForm((f) => ({ ...f, company_name: e.target.value }))}
                placeholder="es. Hotel Srl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="org-vat">Partita IVA</Label>
              <Input
                id="org-vat"
                value={editForm.vat_number}
                onChange={(e) => setEditForm((f) => ({ ...f, vat_number: e.target.value }))}
                placeholder="es. IT01234567890"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingOrg(null)} disabled={saving}>
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvataggio..." : "Salva modifiche"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingOrg} onOpenChange={(open) => !open && setDeletingOrg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina organizzazione</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingOrg && getHotelsForOrg(deletingOrg.id).length > 0 ? (
                <>
                  Impossibile eliminare <strong>{deletingOrg?.name}</strong> perche ha{" "}
                  {getHotelsForOrg(deletingOrg.id).length} struttura/e associate. Rimuovi prima
                  le strutture.
                </>
              ) : (
                <>
                  Sei sicuro di voler eliminare <strong>{deletingOrg?.name}</strong>? Questa azione
                  non puo essere annullata.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
              {error}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} onClick={() => setError(null)}>Annulla</AlertDialogCancel>
            {deletingOrg && getHotelsForOrg(deletingOrg.id).length === 0 && (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  handleDelete()
                }}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Eliminazione..." : "Elimina"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Dialog */}
      <Dialog open={creatingOrg} onOpenChange={(open) => !open && setCreatingOrg(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuova Organizzazione</DialogTitle>
            <DialogDescription>
              Crea una nuova anagrafica aziendale. Potrai poi associare le strutture.
            </DialogDescription>
          </DialogHeader>

          {error && creatingOrg && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-org-name">Nome organizzazione *</Label>
              <Input
                id="new-org-name"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="es. Hotel Belvedere Srl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-org-type">Tipo</Label>
              <Select
                value={editForm.type}
                onValueChange={(v) => setEditForm((f) => ({ ...f, type: v }))}
              >
                <SelectTrigger id="new-org-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hotel">Azienda Alberghiera</SelectItem>
                  <SelectItem value="consultant">Consulente Revenue Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-org-company">Ragione sociale</Label>
              <Input
                id="new-org-company"
                value={editForm.company_name}
                onChange={(e) => setEditForm((f) => ({ ...f, company_name: e.target.value }))}
                placeholder="es. Hotel Belvedere Srl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-org-vat">Partita IVA</Label>
              <Input
                id="new-org-vat"
                value={editForm.vat_number}
                onChange={(e) => setEditForm((f) => ({ ...f, vat_number: e.target.value }))}
                placeholder="es. IT01234567890"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatingOrg(false)} disabled={saving}>
              Annulla
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Creazione..." : "Crea organizzazione"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force Onboarding - Conferma */}
      <AlertDialog open={!!forcingOrg} onOpenChange={(open) => !open && setForcingOrg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Forza completamento onboarding</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Per <strong>{forcingOrg?.name}</strong> verra&apos; eseguito quanto segue:
                </p>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  <li>
                    Reset di <code>setup_completed=false</code> sul profilo di tutti gli utenti
                    dell&apos;organizzazione
                  </li>
                  <li>
                    Generazione di un magic link per ogni utente che redirige a{" "}
                    <code>/onboarding</code> al click (scadenza 24 ore)
                  </li>
                  <li>
                    <strong>Invio automatico dell&apos;email</strong> di attivazione a ciascun
                    utente con il proprio magic link
                  </li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  I link generati restano comunque visibili nel pannello: se per qualche utente
                  l&apos;email non viene inviata, puoi copiare il link e inoltrarlo manualmente
                  come fallback.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={forcingLoading}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (forcingOrg) handleForceOnboarding(forcingOrg)
              }}
              disabled={forcingLoading}
            >
              {forcingLoading ? "Elaborazione..." : "Conferma"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Force Onboarding - Risultati */}
      <Dialog open={!!forcingResult} onOpenChange={(open) => !open && setForcingResult(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Onboarding forzato completato</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {forcingResult?.affectedUsers} utenti di{" "}
                  <strong>{forcingResult?.organization.name}</strong> sono stati reinstradati al
                  flusso di onboarding.
                </p>
                {forcingResult && (
                  <div
                    className={`text-sm rounded-md px-3 py-2 border ${
                      forcingResult.emailsSent === forcingResult.affectedUsers
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : forcingResult.emailsSent === 0
                          ? "bg-amber-50 border-amber-200 text-amber-800"
                          : "bg-amber-50 border-amber-200 text-amber-800"
                    }`}
                  >
                    {forcingResult.message ||
                      `Email inviate: ${forcingResult.emailsSent}/${forcingResult.affectedUsers}`}
                  </div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {forcingResult?.links.map((l) => (
              <div key={l.userId} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="font-medium text-sm break-all">{l.email}</div>
                    {!l.error &&
                      (l.emailSent ? (
                        <Badge
                          variant="outline"
                          className="bg-emerald-50 border-emerald-200 text-emerald-700 shrink-0"
                        >
                          <Mail className="h-3 w-3 mr-1" />
                          Email inviata
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-amber-50 border-amber-200 text-amber-700 shrink-0"
                        >
                          <MailX className="h-3 w-3 mr-1" />
                          Email non inviata - inoltra manualmente
                        </Badge>
                      ))}
                  </div>
                  {!l.error && l.magicLink && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(l.magicLink!, l.userId)}
                      >
                        {copiedLinkId === l.userId ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                            Copiato
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 mr-1" />
                            Copia link
                          </>
                        )}
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href={l.magicLink} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5 mr-1" />
                          Apri
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
                {l.error ? (
                  <div className="text-xs text-destructive break-all">Errore: {l.error}</div>
                ) : (
                  <div className="text-xs text-muted-foreground break-all font-mono bg-muted/50 p-2 rounded">
                    {l.magicLink}
                  </div>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setForcingResult(null)}>Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
