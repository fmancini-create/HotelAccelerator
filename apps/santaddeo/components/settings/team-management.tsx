"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
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
import { UserPlus, Trash2, Mail, Clock, Shield, Copy, CheckCircle2, Link2, Pencil, RefreshCw, RotateCcw, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { PermissionsManager } from "./permissions-manager"

interface TeamManagementProps {
  hotelId: string
  teamMembers: any[]
  invitations: any[]
  canManageTeam: boolean
  isBasicPlan: boolean
  currentUserId: string
}

export function TeamManagement({
  hotelId,
  teamMembers,
  invitations,
  canManageTeam,
  isBasicPlan,
  currentUserId,
}: TeamManagementProps) {
  const router = useRouter()
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [removingMember, setRemovingMember] = useState<string | null>(null)
  const [inviteForm, setInviteForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "sub_user" as "property_admin" | "sub_user" | "consultant",
  })
  const [inviteResult, setInviteResult] = useState<{
    success: boolean
    emailSent: boolean
    inviteUrl: string
    message: string
  } | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [editingMember, setEditingMember] = useState<{
    id: string
    firstName: string
    lastName: string
    role: string
  } | null>(null)
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", role: "" })
  const [managingPermissionsFor, setManagingPermissionsFor] = useState<{
    id: string
    name: string
    role: string
  } | null>(null)
  const [resendingInvite, setResendingInvite] = useState<string | null>(null)
  const [cancellingInvite, setCancellingInvite] = useState<string | null>(null)
  const [resendResult, setResendResult] = useState<{
    invitationId: string
    success: boolean
    emailSent: boolean
    inviteUrl?: string
    message: string
  } | null>(null)

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setInviteError(null)
    setInviteResult(null)

    try {
      const response = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: hotelId,
          email: inviteForm.email,
          first_name: inviteForm.firstName.trim(),
          last_name: inviteForm.lastName.trim(),
          role: inviteForm.role,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setInviteError(data.error || "Errore durante l'invio dell'invito")
        return
      }

      setInviteResult({
        success: true,
        emailSent: data.emailSent,
        inviteUrl: data.inviteUrl,
        message: data.message,
      })

      setInviteForm({ email: "", firstName: "", lastName: "", role: "sub_user" })
      router.refresh()
    } catch (error) {
      console.error("Error sending invitation:", error)
      setInviteError("Errore di rete durante l'invio dell'invito")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } catch {
      // Fallback: select text
      const textArea = document.createElement("textarea")
      textArea.value = url
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand("copy")
      document.body.removeChild(textArea)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/team/${memberId}`, {
        method: "DELETE",
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to remove member")

      setRemovingMember(null)
      router.refresh()
      alert("Membro rimosso con successo!")
    } catch (error) {
      console.error("Error removing member:", error)
      alert(error instanceof Error ? error.message : "Errore durante la rimozione del membro")
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenEdit = (member: any) => {
    setEditingMember({
      id: member.id,
      firstName: member.first_name || "",
      lastName: member.last_name || "",
      role: member.role,
    })
    setEditForm({
      firstName: member.first_name || "",
      lastName: member.last_name || "",
      role: member.role,
    })
  }

  const handleUpdateMember = async () => {
    if (!editingMember) return
    setIsLoading(true)
    try {
      const response = await fetch(`/api/team/${editingMember.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: editForm.firstName.trim(),
          last_name: editForm.lastName.trim(),
          role: editForm.role,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Errore durante la modifica")

      setEditingMember(null)
      router.refresh()
      alert("Membro aggiornato con successo!")
    } catch (error) {
      console.error("Error updating member:", error)
      alert(error instanceof Error ? error.message : "Errore durante la modifica del membro")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelInvitation = async (invitationId: string) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/team/invitations/${invitationId}`, {
        method: "DELETE",
      })

      if (!response.ok) throw new Error("Failed to cancel invitation")

      setCancellingInvite(null)
      router.refresh()
    } catch (error) {
      console.error("Error canceling invitation:", error)
      alert("Errore durante l'annullamento dell'invito")
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendInvitation = async (invitationId: string) => {
    setResendingInvite(invitationId)
    setResendResult(null)
    try {
      const response = await fetch(`/api/team/invitations/${invitationId}/resend`, {
        method: "POST",
      })

      const data = await response.json()

      if (!response.ok) {
        alert(data.error || "Errore durante il reinvio dell'invito")
        return
      }

      setResendResult({
        invitationId,
        success: true,
        emailSent: data.emailSent,
        inviteUrl: data.inviteUrl,
        message: data.message,
      })
      router.refresh()
    } catch (error) {
      console.error("Error resending invitation:", error)
      alert("Errore di rete durante il reinvio dell'invito")
    } finally {
      setResendingInvite(null)
    }
  }

  const getRoleBadge = (role: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      super_admin: "destructive",
      property_admin: "default",
      consultant: "secondary",
      sub_user: "outline",
    }
    const labels: Record<string, string> = {
      super_admin: "Super Admin",
      property_admin: "Admin Struttura",
      consultant: "Consulente",
      sub_user: "Utente",
    }
    return <Badge variant={variants[role] || "outline"}>{labels[role] || role}</Badge>
  }

  return (
    <div className="space-y-6">
      {/* Team Members */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Membri del Team ({teamMembers.length})</h3>
          {canManageTeam && (
            <Button onClick={() => { setIsInviteDialogOpen(true); setInviteResult(null); setInviteError(null) }} size="sm">
              <UserPlus className="h-4 w-4 mr-2" />
              Invita Collaboratore
            </Button>
          )}
        </div>

        <div className="space-y-2">
          {teamMembers.map((member) => (
            <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-sm font-semibold text-blue-600">
                    {member.first_name?.[0] || member.email[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="font-medium">
                    {member.first_name} {member.last_name}
                  </div>
                  <div className="text-sm text-muted-foreground">{member.email}</div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Registrato: {new Date(member.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </span>
                    <span className="flex items-center gap-1">
                      {member.last_login_at
                        ? <>Ultimo accesso: {new Date(member.last_login_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</>
                        : <span className="text-amber-600">Mai effettuato accesso</span>}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getRoleBadge(member.role)}
                {canManageTeam && member.id !== currentUserId && member.role !== "super_admin" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenEdit(member)}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Modifica
                  </Button>
                )}
                {canManageTeam && member.role !== "super_admin" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setManagingPermissionsFor({
                        id: member.id,
                        name: `${member.first_name} ${member.last_name}`,
                        role: member.role,
                      })
                    }
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    Permessi
                  </Button>
                )}
                {canManageTeam && member.id !== currentUserId && member.role !== "super_admin" && (
                  <Button variant="ghost" size="sm" onClick={() => setRemovingMember(member.id)}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Inviti Pendenti ({invitations.length})</h3>
          <div className="space-y-2">
            {invitations.map((invitation) => {
              const isExpired = new Date(invitation.expires_at) < new Date()
              return (
                <div key={invitation.id} className={`flex items-center justify-between p-4 border rounded-lg ${isExpired ? "bg-red-50 border-red-200" : "bg-yellow-50 border-yellow-200"}`}>
                  <div className="flex items-center gap-4">
                    <Mail className={`h-5 w-5 ${isExpired ? "text-red-500" : "text-yellow-600"}`} />
                    <div>
                      <div className="font-medium">
                        {invitation.first_name || invitation.last_name
                          ? `${invitation.first_name || ""} ${invitation.last_name || ""}`.trim()
                          : invitation.email}
                      </div>
                      {(invitation.first_name || invitation.last_name) && (
                        <div className="text-sm text-muted-foreground">{invitation.email}</div>
                      )}
                      <div className={`text-sm flex items-center gap-2 ${isExpired ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                        <Clock className="h-3 w-3" />
                        {isExpired
                          ? `Scaduto il ${new Date(invitation.expires_at).toLocaleDateString("it-IT")}`
                          : `Scade il ${new Date(invitation.expires_at).toLocaleDateString("it-IT")}`}
                      </div>
                      {resendResult?.invitationId === invitation.id && resendResult.success && (
                        <div className="mt-1">
                          <span className="text-xs text-green-700 font-medium">
                            {resendResult.message}
                          </span>
                          {!resendResult.emailSent && resendResult.inviteUrl && (
                            <div className="flex items-center gap-1 mt-1">
                              <Input
                                value={resendResult.inviteUrl}
                                readOnly
                                className="text-xs font-mono h-7 max-w-xs"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2"
                                onClick={() => handleCopyLink(resendResult.inviteUrl!)}
                              >
                                {copiedLink ? (
                                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getRoleBadge(invitation.role)}
                    {canManageTeam && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResendInvitation(invitation.id)}
                          disabled={resendingInvite === invitation.id}
                        >
                          <RotateCcw className={`h-4 w-4 mr-2 ${resendingInvite === invitation.id ? "animate-spin" : ""}`} />
                          {resendingInvite === invitation.id ? "Invio..." : "Reinvia"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setCancellingInvite(invitation.id)}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancella
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={isInviteDialogOpen} onOpenChange={(open) => {
        setIsInviteDialogOpen(open)
        if (!open) {
          setInviteResult(null)
          setInviteError(null)
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Invita Collaboratore</DialogTitle>
            <DialogDescription>
              Invia un invito via email per aggiungere un nuovo collaboratore al team della struttura
            </DialogDescription>
          </DialogHeader>

          {inviteResult ? (
            <div className="space-y-4">
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  {inviteResult.message}
                </AlertDescription>
              </Alert>

              {!inviteResult.emailSent && inviteResult.inviteUrl && (
                <div className="space-y-2">
                  <Label>Link di invito (condividi manualmente):</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={inviteResult.inviteUrl}
                      readOnly
                      className="text-xs font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyLink(inviteResult.inviteUrl)}
                      className="shrink-0"
                    >
                      {copiedLink ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    L'invito scade tra 7 giorni. Invia questo link al collaboratore.
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => {
                    setInviteResult(null)
                    setInviteError(null)
                  }}
                >
                  Invita un altro
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsInviteDialogOpen(false)}
                >
                  Chiudi
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleInvite} className="space-y-4">
              {inviteError && (
                <Alert variant="destructive">
                  <AlertDescription>{inviteError}</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-firstName">Nome</Label>
                  <Input
                    id="invite-firstName"
                    type="text"
                    placeholder="Mario"
                    value={inviteForm.firstName}
                    onChange={(e) => setInviteForm({ ...inviteForm, firstName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-lastName">Cognome</Label>
                  <Input
                    id="invite-lastName"
                    type="text"
                    placeholder="Rossi"
                    value={inviteForm.lastName}
                    onChange={(e) => setInviteForm({ ...inviteForm, lastName: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="invite-email">Email del collaboratore *</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="nome@esempio.com"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="invite-role">Ruolo *</Label>
                <Select
                  value={inviteForm.role}
                  onValueChange={(value: any) => setInviteForm({ ...inviteForm, role: value })}
                >
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="property_admin">
                      Admin Struttura - Accesso completo alla gestione
                    </SelectItem>
                    <SelectItem value="sub_user">
                      Utente - Accesso in visualizzazione con permessi limitati
                    </SelectItem>
                    <SelectItem value="consultant">
                      Consulente - Accesso consulenziale esterno
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  I permessi di ogni utente potranno essere personalizzati dopo l'accettazione dell'invito.
                </p>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsInviteDialogOpen(false)}>
                  Annulla
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Invio in corso..." : "Invia Invito"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Member Dialog */}
      <Dialog open={!!editingMember} onOpenChange={() => setEditingMember(null)}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Modifica Membro</DialogTitle>
            <DialogDescription>
              Modifica i dati e il ruolo di {editingMember?.firstName} {editingMember?.lastName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-firstName">Nome</Label>
                <Input
                  id="edit-firstName"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-lastName">Cognome</Label>
                <Input
                  id="edit-lastName"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-role">Ruolo</Label>
              <Select
                value={editForm.role}
                onValueChange={(value) => setEditForm({ ...editForm, role: value })}
              >
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="property_admin">
                    Admin Struttura - Accesso completo alla gestione
                  </SelectItem>
                  <SelectItem value="sub_user">
                    Utente - Accesso in visualizzazione con permessi limitati
                  </SelectItem>
                  <SelectItem value="consultant">
                    Consulente - Accesso consulenziale esterno
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingMember(null)}>
              Annulla
            </Button>
            <Button type="button" onClick={handleUpdateMember} disabled={isLoading}>
              {isLoading ? "Salvataggio..." : "Salva Modifiche"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation */}
      <AlertDialog open={!!removingMember} onOpenChange={() => setRemovingMember(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovi Membro</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler rimuovere questo membro dal team? Perderà l'accesso alla struttura.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removingMember && handleRemoveMember(removingMember)}
              disabled={isLoading}
            >
              Rimuovi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Invitation Confirmation */}
      <AlertDialog open={!!cancellingInvite} onOpenChange={() => setCancellingInvite(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancella Invito</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler cancellare questo invito? Il link di invito non sara' piu' valido e l'utente non potra' piu' registrarsi tramite questo invito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancellingInvite && handleCancelInvitation(cancellingInvite)}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {isLoading ? "Cancellazione..." : "Cancella Invito"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permissions Dialog */}
      <Dialog open={!!managingPermissionsFor} onOpenChange={() => setManagingPermissionsFor(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gestione Permessi</DialogTitle>
            <DialogDescription>
              Personalizza i permessi per {managingPermissionsFor?.name || "questo utente"}
            </DialogDescription>
          </DialogHeader>

          {managingPermissionsFor && (
            <PermissionsManager
              userId={managingPermissionsFor.id}
              userName={managingPermissionsFor.name}
              userRole={managingPermissionsFor.role}
              canManagePermissions={canManageTeam}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
