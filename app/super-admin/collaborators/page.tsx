"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Building2, CheckCircle2, Shield, ShieldCheck, ShieldOff, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type PlatformRole = "super_admin" | "support" | "viewer"

type TeamMember = {
  user_id: string
  collaborator_id: string | null
  email: string
  name: string
  tenant_role: string
  is_tenant_admin: boolean
  platform_role: PlatformRole | null
  platform_access_active: boolean
  last_login_at: string | null
  created_at: string
}

type LegacyCollaborator = {
  id: string
  email: string
  name: string
  role: PlatformRole
  is_active: boolean
}

type TeamResponse = {
  tenant: { id: string; slug: string; name: string }
  team: TeamMember[]
  legacy_collaborators: LegacyCollaborator[]
}

const roleLabel: Record<PlatformRole, string> = {
  super_admin: "Super Admin",
  support: "Supporto",
  viewer: "Sola lettura",
}

function formatDate(value: string | null) {
  if (!value) return "Mai"
  return new Date(value).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function PlatformCollaboratorsPage() {
  const [data, setData] = useState<TeamResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [roleDialogMember, setRoleDialogMember] = useState<TeamMember | null>(null)
  const [selectedRole, setSelectedRole] = useState<PlatformRole>("support")

  const loadTeam = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch("/api/super-admin/collaborators", { cache: "no-store" })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Impossibile caricare il team 4BID")
      setData(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il caricamento")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTeam()
  }, [])

  const openRoleDialog = (member: TeamMember) => {
    setSelectedRole(member.platform_role ?? "support")
    setRoleDialogMember(member)
  }

  const savePlatformRole = async () => {
    if (!roleDialogMember) return
    const member = roleDialogMember
    try {
      setSavingId(member.user_id)
      const response = member.collaborator_id
        ? await fetch(`/api/super-admin/collaborators/${member.collaborator_id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: selectedRole }),
          })
        : await fetch("/api/super-admin/collaborators", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: member.email, role: selectedRole }),
          })

      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Impossibile aggiornare l'accesso piattaforma")

      if (member.collaborator_id && !member.platform_access_active) {
        const activateResponse = await fetch(`/api/super-admin/collaborators/${member.collaborator_id}/activate`, {
          method: "PATCH",
        })
        const activatePayload = await activateResponse.json()
        if (!activateResponse.ok) throw new Error(activatePayload.error || "Impossibile riattivare l'accesso")
      }

      setRoleDialogMember(null)
      await loadTeam()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio")
    } finally {
      setSavingId(null)
    }
  }

  const togglePlatformAccess = async (member: TeamMember) => {
    if (!member.collaborator_id || member.platform_role === "super_admin") return
    const action = member.platform_access_active ? "suspend" : "activate"
    try {
      setSavingId(member.user_id)
      setError(null)
      const response = await fetch(`/api/super-admin/collaborators/${member.collaborator_id}/${action}`, {
        method: "PATCH",
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Impossibile modificare l'accesso piattaforma")
      await loadTeam()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'aggiornamento")
    } finally {
      setSavingId(null)
    }
  }

  const manageFourBidTeam = async () => {
    if (!data?.tenant.id) return
    try {
      setError(null)
      const response = await fetch("/api/platform/switch-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: data.tenant.id }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Impossibile selezionare il tenant 4BID")
      window.location.assign("/admin/users")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'apertura del Team 4BID")
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Caricamento Team 4BID...</div>
  }

  if (!data) {
    return (
      <div className="p-8">
        <p className="text-sm text-destructive">{error || "Team 4BID non disponibile"}</p>
        <Button className="mt-4" variant="outline" onClick={() => void loadTeam()}>
          Riprova
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-muted p-2.5">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Team 4BID & accessi piattaforma</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Le persone sono gestite una sola volta nel tenant 4BID. Qui assegni soltanto gli eventuali privilegi globali
              necessari per amministrare HotelAccelerator.
            </p>
          </div>
        </div>
        <Button onClick={() => void manageFourBidTeam()}>
          <Building2 className="mr-2 h-4 w-4" />
          Gestisci Team 4BID
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Persone nel tenant 4BID</p>
          <p className="mt-1 text-2xl font-semibold">{data.team.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Con accesso globale attivo</p>
          <p className="mt-1 text-2xl font-semibold">{data.team.filter((member) => member.platform_access_active).length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Solo operativita 4BID</p>
          <p className="mt-1 text-2xl font-semibold">{data.team.filter((member) => !member.platform_role).length}</p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Collaboratori 4BID</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            L'appartenenza a 4BID non concede automaticamente accesso cross-tenant.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px]">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Persona</th>
                <th className="px-5 py-3 font-medium">Ruolo 4BID</th>
                <th className="px-5 py-3 font-medium">Accesso piattaforma</th>
                <th className="px-5 py-3 font-medium">Ultimo accesso globale</th>
                <th className="px-5 py-3 text-right font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.team.map((member) => {
                const busy = savingId === member.user_id
                return (
                  <tr key={member.user_id}>
                    <td className="px-5 py-4">
                      <div className="font-medium">{member.name}</div>
                      <div className="text-sm text-muted-foreground">{member.email}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{member.tenant_role}</Badge>
                        {member.is_tenant_admin && <Badge>Admin tenant</Badge>}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {!member.platform_role ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <ShieldOff className="h-4 w-4" /> Solo 4BID
                        </div>
                      ) : member.platform_access_active ? (
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4" />
                          <Badge variant={member.platform_role === "super_admin" ? "destructive" : "secondary"}>
                            {roleLabel[member.platform_role]}
                          </Badge>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Shield className="h-4 w-4" />
                          <Badge variant="outline">{roleLabel[member.platform_role]} sospeso</Badge>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">{formatDate(member.last_login_at)}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => openRoleDialog(member)}>
                          {member.platform_role ? "Ruolo globale" : "Abilita accesso"}
                        </Button>
                        {member.collaborator_id && member.platform_role !== "super_admin" && (
                          <Button
                            size="sm"
                            variant={member.platform_access_active ? "outline" : "default"}
                            disabled={busy}
                            onClick={() => void togglePlatformAccess(member)}
                          >
                            {member.platform_access_active ? "Sospendi" : "Riattiva"}
                          </Button>
                        )}
                        {member.platform_role === "super_admin" && (
                          <span className="inline-flex items-center px-2 text-xs text-muted-foreground">
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Protetto
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {data.team.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Nessun collaboratore presente nel tenant 4BID.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data.legacy_collaborators.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h2 className="font-semibold">Record globali storici fuori dal Team 4BID</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Non vengono cancellati automaticamente: restano separati per audit finche non viene decisa una bonifica esplicita.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {data.legacy_collaborators.map((legacy) => (
                  <Badge key={legacy.id} variant="outline">
                    {legacy.email} · {roleLabel[legacy.role]} · {legacy.is_active ? "attivo" : "inattivo"}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={Boolean(roleDialogMember)} onOpenChange={(open) => !open && setRoleDialogMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Privilegio globale HotelAccelerator</DialogTitle>
            <DialogDescription>
              {roleDialogMember
                ? `${roleDialogMember.name} resta un utente del tenant 4BID. Questo ruolo abilita soltanto operazioni globali della piattaforma.`
                : "Seleziona il ruolo globale."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="platform-role">Ruolo globale</Label>
            <Select value={selectedRole} onValueChange={(value: PlatformRole) => setSelectedRole(value)}>
              <SelectTrigger id="platform-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="support">Supporto</SelectItem>
                <SelectItem value="viewer">Sola lettura</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogMember(null)}>
              Annulla
            </Button>
            <Button disabled={!roleDialogMember || savingId === roleDialogMember?.user_id} onClick={() => void savePlatformRole()}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
