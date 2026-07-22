"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Search,
  RefreshCw,
  Edit,
  Users,
  Building2,
  Shield,
  UserCheck,
  Mail,
  Send,
  Loader2,
  AlertCircle,
  MailPlus,
  Eye,
  Trash2,
  UserX,
  AlertTriangle,
  Bug,
  UserPlus,
  Copy,
  CheckCircle2,
  Hotel as HotelIcon,
} from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface UserData {
  id: string
  invitation_id?: string
  email: string
  first_name: string | null
  last_name: string | null
  phone?: string | null
  mobile?: string | null
  job_title?: string | null
  role: string
  organization_id: string | null
  organization_name: string | null
  hotels: Array<{ id: string; name: string }>
  hotel_id?: string | null
  created_at: string
  last_sign_in_at: string | null
  email_confirmed_at: string | null
  is_active: boolean
  onboarding_completed: boolean
  is_invitation?: boolean
  invitation_expires_at?: string
  invitation_hotel_id?: string
  invitation_hotel_name?: string
  invited_by_name?: string
}

interface Organization {
  id: string
  name: string
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  superadmin: "Super Admin",
  property_admin: "Admin Struttura",
  sub_user: "Utente",
  user: "Utente",
  consultant: "Consulente",
  sales_agent: "Venditore",
}

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-red-100 text-red-800 border-red-200",
  superadmin: "bg-red-100 text-red-800 border-red-200",
  property_admin: "bg-blue-100 text-blue-800 border-blue-200",
  sub_user: "bg-gray-100 text-gray-800 border-gray-200",
  user: "bg-gray-100 text-gray-800 border-gray-200",
  consultant: "bg-purple-100 text-purple-800 border-purple-200",
  sales_agent: "bg-emerald-100 text-emerald-800 border-emerald-200",
}

interface Hotel {
  id: string
  name: string
  organization_id?: string
}

export function UsersManager() {
  const [users, setUsers] = useState<UserData[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [orgFilter, setOrgFilter] = useState("all")

  // Edit dialog
  const [editUser, setEditUser] = useState<UserData | null>(null)
  const [editRole, setEditRole] = useState("")
  const [editOrgId, setEditOrgId] = useState("")
  const [editHotelId, setEditHotelId] = useState("")
  // Dati anagrafici/contatto modificabili dal Super Admin
  const [editFirstName, setEditFirstName] = useState("")
  const [editLastName, setEditLastName] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editMobile, setEditMobile] = useState("")
  const [editJobTitle, setEditJobTitle] = useState("")
  const [saving, setSaving] = useState(false)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [remindingId, setRemindingId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState("all")
  const [spamFilter, setSpamFilter] = useState(false)
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null)
  const router = useRouter()

  // Delete state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; permanent: boolean; ids: string[] }>({
    open: false, permanent: false, ids: [],
  })
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [deleting, setDeleting] = useState(false)

  // Invite dialog state (new user creation from superadmin)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "property_admin" as "property_admin" | "sub_user" | "consultant",
    organizationId: "",
    hotelId: "",
  })
  const [inviteSubmitting, setInviteSubmitting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteResult, setInviteResult] = useState<{
    emailSent: boolean
    inviteUrl: string
    message: string
  } | null>(null)
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false)

  // Gestione multi-struttura (user_property_map) - dialog
  const [propsUser, setPropsUser] = useState<UserData | null>(null)
  const [propsSelected, setPropsSelected] = useState<Set<string>>(new Set())
  const [propsLoading, setPropsLoading] = useState(false)
  const [propsSaving, setPropsSaving] = useState(false)
  const [propsSearch, setPropsSearch] = useState("")

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/superadmin/users")
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
        setOrganizations(data.organizations || [])
        setHotels(data.hotels || [])
      }
    } catch (e) {
      console.error("Error fetching users:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleEdit = (user: UserData) => {
    setEditUser(user)
    setEditRole(user.role)
    setEditOrgId(user.organization_id || "none")
    setEditHotelId(user.hotel_id || "none")
    setEditFirstName(user.first_name || "")
    setEditLastName(user.last_name || "")
    setEditEmail(user.email && user.email !== "N/A" ? user.email : "")
    setEditPhone(user.phone || "")
    setEditMobile(user.mobile || "")
    setEditJobTitle(user.job_title || "")
  }

  const handleSave = async () => {
    if (!editUser) return
    setSaving(true)
    try {
      // Per gli inviti pendenti non esiste ancora una riga profiles/auth:
      // niente modifica anagrafica, solo i campi gia' gestiti prima.
      const anagrafica = editUser.is_invitation
        ? {}
        : {
            first_name: editFirstName,
            last_name: editLastName,
            email: editEmail,
            phone: editPhone,
            mobile: editMobile,
            job_title: editJobTitle,
          }
      const res = await fetch("/api/superadmin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: editUser.id,
          role: editRole,
          organization_id: editOrgId === "none" ? null : editOrgId,
          hotel_id: editHotelId === "none" ? null : editHotelId,
          ...anagrafica,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setEditUser(null)
        fetchUsers()
        if (data.warning) {
          toast.warning(data.warning)
        } else {
          toast.success("Utente aggiornato con successo")
        }
      } else {
        toast.error(data.error || "Errore durante il salvataggio")
      }
    } catch (e) {
      console.error("Error saving user:", e)
      toast.error("Errore di rete durante il salvataggio")
    } finally {
      setSaving(false)
    }
  }

  // Apre il dialog "Gestisci strutture" e carica le associazioni correnti
  const openProperties = async (user: UserData) => {
    setPropsUser(user)
    setPropsSelected(new Set())
    setPropsSearch("")
    setPropsLoading(true)
    try {
      const res = await fetch(`/api/superadmin/users/properties?user_id=${user.id}`)
      const data = await res.json()
      if (res.ok) {
        setPropsSelected(new Set<string>(data.hotelIds || []))
      } else {
        toast.error(data.error || "Errore nel caricamento delle strutture")
      }
    } catch (e) {
      console.error("Error loading property map:", e)
      toast.error("Errore di rete nel caricamento delle strutture")
    } finally {
      setPropsLoading(false)
    }
  }

  const togglePropsHotel = (hotelId: string) => {
    setPropsSelected((prev) => {
      const next = new Set(prev)
      if (next.has(hotelId)) next.delete(hotelId)
      else next.add(hotelId)
      return next
    })
  }

  const handleSaveProperties = async () => {
    if (!propsUser) return
    setPropsSaving(true)
    try {
      const res = await fetch("/api/superadmin/users/properties", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: propsUser.id,
          hotelIds: Array.from(propsSelected),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(
          `Strutture aggiornate: ${data.total} associate (${data.added} aggiunte, ${data.removed} rimosse)`,
        )
        setPropsUser(null)
        fetchUsers()
      } else {
        toast.error(data.error || "Errore durante il salvataggio delle strutture")
      }
    } catch (e) {
      console.error("Error saving property map:", e)
      toast.error("Errore di rete durante il salvataggio")
    } finally {
      setPropsSaving(false)
    }
  }

  const handleResendInvite = async (user: UserData) => {
    if (!user.invitation_id) return
    setResendingId(user.invitation_id)
    try {
      const res = await fetch(`/api/team/invitations/${user.invitation_id}/resend`, {
        method: "POST",
        credentials: "include",
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Errore")
      }
      const data = await res.json()
      toast.success(data.message || "Invito reinviato con successo")
    } catch (e: any) {
      toast.error(e.message || "Errore nel reinvio dell'invito")
    } finally {
      setResendingId(null)
    }
  }

  // Invia un promemoria di onboarding a un utente registrato che non ha
  // ancora completato la configurazione (es. registrato via Google OAuth,
  // senza organizzazione/struttura). A differenza del force-onboarding
  // per-organizzazione, questo funziona anche per utenti senza org.
  const handleSendOnboardingReminder = async (user: UserData) => {
    setRemindingId(user.id)
    try {
      const res = await fetch(`/api/superadmin/users/${user.id}/send-onboarding-reminder`, {
        method: "POST",
        credentials: "include",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore")
      if (data.emailSent) {
        toast.success(data.message || `Promemoria onboarding inviato a ${user.email}`)
      } else {
        toast.warning(data.message || "Link generato ma email non inviata")
      }
      fetchUsers()
    } catch (e: any) {
      toast.error(e.message || "Errore nell'invio del promemoria")
    } finally {
      setRemindingId(null)
    }
  }

  const handleDeleteConfirm = async () => {
    const { ids, permanent } = deleteDialog
    if (permanent && deleteConfirmText !== "ELIMINA") return
    setDeleting(true)
    try {
      const res = await fetch("/api/superadmin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ids: ids, permanent }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore")
      toast.success(
        permanent
          ? `${data.deleted} utent${data.deleted === 1 ? "e eliminato" : "i eliminati"} in modo permanente`
          : `${data.deleted} utent${data.deleted === 1 ? "e disattivato" : "i disattivati"}`
      )
      if (data.failed > 0) toast.error(`${data.failed} eliminazioni fallite`)
      setDeleteDialog({ open: false, permanent: false, ids: [] })
      setDeleteConfirmText("")
      setSelectedIds(new Set())
      fetchUsers()
    } catch (e: any) {
      toast.error(e.message || "Errore nell'eliminazione")
    } finally {
      setDeleting(false)
    }
  }

  const openDeleteDialog = (ids: string[], permanent: boolean) => {
    setDeleteConfirmText("")
    setDeleteDialog({ open: true, permanent, ids })
  }

  const resetInviteForm = () => {
    setInviteForm({
      email: "",
      firstName: "",
      lastName: "",
      role: "property_admin",
      organizationId: "",
      hotelId: "",
    })
    setInviteError(null)
    setInviteResult(null)
    setInviteLinkCopied(false)
  }

  const handleInviteSubmit = async () => {
    setInviteError(null)
    setInviteResult(null)
    if (!inviteForm.email.trim()) {
      setInviteError("L'email e' obbligatoria")
      return
    }
    if (!inviteForm.hotelId) {
      setInviteError("Seleziona la struttura di appartenenza")
      return
    }
    setInviteSubmitting(true)
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          hotel_id: inviteForm.hotelId,
          email: inviteForm.email.trim(),
          first_name: inviteForm.firstName.trim() || undefined,
          last_name: inviteForm.lastName.trim() || undefined,
          role: inviteForm.role,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setInviteError(data.error || "Errore durante la creazione dell'invito")
        return
      }
      setInviteResult({
        emailSent: !!data.emailSent,
        inviteUrl: data.inviteUrl || "",
        message: data.message || "Invito creato con successo",
      })
      // Silently refresh list so the new invitation appears in the table
      fetchUsers()
    } catch (e: any) {
      setInviteError(e?.message || "Errore di rete durante la creazione dell'invito")
    } finally {
      setInviteSubmitting(false)
    }
  }

  const handleCopyInviteLink = async () => {
    if (!inviteResult?.inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteResult.inviteUrl)
      setInviteLinkCopied(true)
      setTimeout(() => setInviteLinkCopied(false), 2000)
    } catch {
      /* clipboard blocked — user can select manually */
    }
  }

  // Hotels filtered by the org selected in the invite dialog. If no org selected
  // we show every hotel.
  const inviteHotelOptions = inviteForm.organizationId
    ? hotels.filter((h) => (h as any).organization_id === inviteForm.organizationId)
    : hotels

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = (ids: string[]) => {
    if (ids.every(id => selectedIds.has(id))) {
      setSelectedIds(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n })
    } else {
      setSelectedIds(prev => new Set([...prev, ...ids]))
    }
  }

  const handleImpersonate = async (user: UserData) => {
    if (user.is_invitation) return
    setImpersonatingId(user.id)
    try {
      const res = await fetch("/api/superadmin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Errore nell'impersonalizzazione")
      }
      const data = await res.json()
      toast.success(`Impersonalizzazione attiva: ${data.user?.name || user.email}`)
      router.push("/dashboard")
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || "Errore nell'impersonalizzazione")
    } finally {
      setImpersonatingId(null)
    }
  }

  const isExpired = (dateStr?: string) => {
    if (!dateStr) return false
    return new Date(dateStr) < new Date()
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Mai"
    return new Date(dateStr).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  // Spam detection: not verified + never logged in + registered in last 30 days
  const isSpam = (u: UserData) =>
    !u.is_invitation &&
    !u.email_confirmed_at &&
    !u.last_sign_in_at

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.first_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (u.last_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (u.organization_name || "").toLowerCase().includes(search.toLowerCase())

    const matchesRole = roleFilter === "all" || u.role === roleFilter
    const matchesOrg =
      orgFilter === "all" ||
      (orgFilter === "none" && !u.organization_id) ||
      u.organization_id === orgFilter

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "registered" && !u.is_invitation) ||
      (statusFilter === "invited" && u.is_invitation)

    const matchesSpam = !spamFilter || isSpam(u)

    return matchesSearch && matchesRole && matchesOrg && matchesStatus && matchesSpam
  })

  const spamUsers = users.filter(isSpam)
  const visibleIds = filteredUsers.map(u => u.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))

  // Stats
  const registeredUsers = users.filter((u) => !u.is_invitation)
  const invitedUsers = users.filter((u) => u.is_invitation)
  const totalRegistered = registeredUsers.length
  const totalInvited = invitedUsers.length
  const activeUsers = registeredUsers.filter((u) => u.last_sign_in_at).length
  const expiredInvites = invitedUsers.filter((u) => isExpired(u.invitation_expires_at)).length

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">Registrati</span>
              <Users className="h-4 w-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold">{totalRegistered}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">Inviti Pendenti</span>
              <MailPlus className="h-4 w-4 text-amber-600" />
            </div>
            <div className="text-2xl font-bold">{totalInvited}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">Login Effettuato</span>
              <UserCheck className="h-4 w-4 text-green-600" />
            </div>
            <div className="text-2xl font-bold">{activeUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">Inviti Scaduti</span>
              <AlertCircle className="h-4 w-4 text-red-600" />
            </div>
            <div className="text-2xl font-bold">{expiredInvites}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">Totale</span>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{totalRegistered + totalInvited}</div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer border-2 transition-colors ${spamFilter ? "border-red-400 bg-red-50" : "border-transparent hover:border-red-200"}`}
          onClick={() => setSpamFilter(v => !v)}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-red-600 font-medium">Spam</span>
              <Bug className="h-4 w-4 text-red-600" />
            </div>
            <div className="text-2xl font-bold text-red-600">{spamUsers.length}</div>
            <div className="text-[10px] text-red-400 mt-1">{spamFilter ? "Filtro attivo" : "Clicca per filtrare"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Gestione Utenti Piattaforma
              </CardTitle>
              <CardDescription>Tutti gli utenti registrati e invitati su SANTADDEO</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => { resetInviteForm(); setInviteOpen(true) }}
                className="gap-2"
              >
                <UserPlus className="h-4 w-4" />
                Invita Utente
              </Button>
              <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Aggiorna
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca per nome, email, organizzazione..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtra per ruolo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i ruoli</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
                <SelectItem value="property_admin">Admin Struttura</SelectItem>
                <SelectItem value="sub_user">Utente</SelectItem>
                <SelectItem value="consultant">Consulente</SelectItem>
                <SelectItem value="sales_agent">Venditore</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Stato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="registered">Registrati</SelectItem>
                <SelectItem value="invited">Invitati</SelectItem>
              </SelectContent>
            </Select>
            <Select value={orgFilter} onValueChange={setOrgFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtra per org." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le org.</SelectItem>
                <SelectItem value="none">Non assegnati</SelectItem>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-muted-foreground">
                  {filteredUsers.length} utent{filteredUsers.length === 1 ? "e" : "i"} trovati
                  {statusFilter === "all" && (
                    <span className="ml-2 text-xs">
                      ({filteredUsers.filter(u => !u.is_invitation).length} registrati, {filteredUsers.filter(u => u.is_invitation).length} invitati)
                    </span>
                  )}
                </div>
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{selectedIds.size} selezionati</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                      onClick={() => openDeleteDialog(Array.from(selectedIds), false)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Disattiva selezionati
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1.5 text-xs"
                      onClick={() => openDeleteDialog(Array.from(selectedIds), true)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Elimina permanentemente
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => setSelectedIds(new Set())}>
                      Deseleziona
                    </Button>
                  </div>
                )}
              </div>
              <div className="border rounded-lg overflow-x-auto">
                <Table className="[&_th]:px-2 [&_td]:px-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allVisibleSelected}
                          onCheckedChange={() => toggleSelectAll(visibleIds)}
                          aria-label="Seleziona tutti"
                        />
                      </TableHead>
                      <TableHead>Utente</TableHead>
                      <TableHead>Ruolo</TableHead>
                      <TableHead>Organizzazione / Hotel</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => {
                      const expired = u.is_invitation && isExpired(u.invitation_expires_at)
                      const spam = isSpam(u)
                      return (
                      <TableRow key={u.id} className={`${u.is_invitation ? "bg-amber-50/30" : ""} ${spam ? "bg-red-50/40" : ""}`}>
                        <TableCell className="w-10">
                          <Checkbox
                            checked={selectedIds.has(u.id)}
                            onCheckedChange={() => toggleSelect(u.id)}
                            aria-label={`Seleziona ${u.email}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {[u.first_name, u.last_name].filter(Boolean).join(" ") || "N/A"}
                              </span>
                              {u.is_invitation && (
                                <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">
                                  <Mail className="h-2.5 w-2.5 mr-1" />
                                  Invitato
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">{u.email}</span>
                            {u.is_invitation && u.invited_by_name && (
                              <span className="text-[10px] text-muted-foreground/70">
                                {"Invitato da: "}{u.invited_by_name}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={ROLE_COLORS[u.role] || ""}>
                            {ROLE_LABELS[u.role] || u.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 max-w-[220px]">
                            {u.organization_name ? (
                              <div className="flex items-center gap-1.5">
                                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="text-sm truncate" title={u.organization_name}>{u.organization_name}</span>
                              </div>
                            ) : null}
                            {u.hotels.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {u.hotels.slice(0, 2).map((h) => (
                                  <Badge key={h.id} variant="secondary" className="text-xs">
                                    {h.name}
                                  </Badge>
                                ))}
                                {u.hotels.length > 2 && (
                                  <Badge variant="secondary" className="text-xs">
                                    +{u.hotels.length - 2}
                                  </Badge>
                                )}
                              </div>
                            ) : null}
                            {!u.organization_name && u.hotels.length === 0 && (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 text-xs whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-muted-foreground/70 w-9 shrink-0">Reg.</span>
                              <span className={u.is_invitation ? "text-amber-700" : ""}>
                                {formatDate(u.created_at)}
                              </span>
                            </div>
                            {u.is_invitation ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground/70 w-9 shrink-0">Scad.</span>
                                <span className={expired ? "text-red-600 font-medium" : "text-muted-foreground"}>
                                  {expired ? "Scaduto" : formatDate(u.invitation_expires_at || null)}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground/70 w-9 shrink-0">Login</span>
                                <span className="text-muted-foreground">{formatDate(u.last_sign_in_at)}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {u.is_invitation ? (
                              expired ? (
                                <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200 w-fit">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Scaduto
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 w-fit">
                                  <Mail className="h-3 w-3 mr-1" />
                                  In attesa
                                </Badge>
                              )
                            ) : (
                              <>
                                {u.email_confirmed_at ? (
                                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 w-fit">
                                    Verificato
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 w-fit">
                                    Non verificato
                                  </Badge>
                                )}
                                {u.onboarding_completed && (
                                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 w-fit">
                                    Onboarding OK
                                  </Badge>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1">
                            {u.is_invitation ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleResendInvite(u)}
                                  disabled={resendingId === u.invitation_id}
                                  className="text-xs gap-1.5"
                                  title="Reinvia invito"
                                >
                                  {resendingId === u.invitation_id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Send className="h-3.5 w-3.5" />
                                  )}
                                  <span className="hidden xl:inline">Reinvia</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Elimina invito"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => openDeleteDialog([u.id], true)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                {u.role !== "super_admin" && u.role !== "superadmin" && (
                                  <>
                                    {!u.onboarding_completed && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleSendOnboardingReminder(u)}
                                        disabled={remindingId === u.id}
                                        title="Invia promemoria per completare l'onboarding"
                                        className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                      >
                                        {remindingId === u.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <MailPlus className="h-4 w-4" />
                                        )}
                                      </Button>
                                    )}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleImpersonate(u)}
                                      disabled={impersonatingId === u.id}
                                      className="text-xs gap-1.5"
                                      title={`Impersonalizza ${u.first_name || u.email}`}
                                    >
                                      {impersonatingId === u.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Eye className="h-3.5 w-3.5" />
                                      )}
                                      <span className="hidden 2xl:inline">Impersonalizza</span>
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      title="Disattiva utente (reversibile)"
                                      className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                      onClick={() => openDeleteDialog([u.id], false)}
                                    >
                                      <UserX className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      title="Elimina permanentemente"
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => openDeleteDialog([u.id], true)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Gestisci strutture associate"
                                  className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                                  onClick={() => openProperties(u)}
                                >
                                  <HotelIcon className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleEdit(u)}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      )
                    })}
                    {filteredUsers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Nessun utente trovato
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDialog({ open: false, permanent: false, ids: [] })
            setDeleteConfirmText("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteDialog.permanent ? "Elimina Permanentemente" : "Disattiva Utenti"}
            </DialogTitle>
            <DialogDescription>
              {deleteDialog.permanent
                ? `Stai per eliminare permanentemente ${deleteDialog.ids.length} utent${deleteDialog.ids.length === 1 ? "e" : "i"}. Questa azione non puo' essere annullata. Tutti i dati associati verranno rimossi.`
                : `Stai per disattivare ${deleteDialog.ids.length} utent${deleteDialog.ids.length === 1 ? "e" : "i"}. L'account verra' disabilitato ma i dati verranno mantenuti.`}
            </DialogDescription>
          </DialogHeader>
          {deleteDialog.permanent && (
            <div className="space-y-2 py-4">
              <Label className="text-sm font-medium text-destructive">
                Digita ELIMINA per confermare
              </Label>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="ELIMINA"
                className="border-destructive"
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialog({ open: false, permanent: false, ids: [] })
                setDeleteConfirmText("")
              }}
            >
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting || (deleteDialog.permanent && deleteConfirmText !== "ELIMINA")}
            >
              {deleting
                ? "Eliminazione..."
                : deleteDialog.permanent
                  ? "Elimina Permanentemente"
                  : "Disattiva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={(open) => {
        setInviteOpen(open)
        if (!open) resetInviteForm()
      }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Invita un utente</DialogTitle>
            <DialogDescription>
              Il sistema invierà un'email con il link di registrazione. Gli altri superadmin riceveranno una notifica.
            </DialogDescription>
          </DialogHeader>

          {inviteResult ? (
            <div className="space-y-4 py-2">
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  {inviteResult.message}
                </div>
                {inviteResult.emailSent ? (
                  <p className="mt-1 text-xs text-green-700">
                    Email inviata all'utente. Notifica inviata anche agli altri super admin.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-amber-700">
                    L'email non è stata inviata (SMTP non configurato?). Copia il link qui sotto e condividilo manualmente.
                  </p>
                )}
              </div>

              {inviteResult.inviteUrl && (
                <div className="space-y-2">
                  <Label>Link di invito</Label>
                  <div className="flex items-center gap-2">
                    <Input value={inviteResult.inviteUrl} readOnly className="font-mono text-xs" />
                    <Button type="button" variant="outline" size="sm" onClick={handleCopyInviteLink} className="shrink-0">
                      {inviteLinkCopied ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">L'invito scade tra 7 giorni.</p>
                </div>
              )}

              <DialogFooter>
                <Button type="button" onClick={resetInviteForm}>
                  Invita un altro
                </Button>
                <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                  Chiudi
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {inviteError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {inviteError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="inv-first">Nome</Label>
                  <Input
                    id="inv-first"
                    placeholder="Mario"
                    value={inviteForm.firstName}
                    onChange={(e) => setInviteForm({ ...inviteForm, firstName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inv-last">Cognome</Label>
                  <Input
                    id="inv-last"
                    placeholder="Rossi"
                    value={inviteForm.lastName}
                    onChange={(e) => setInviteForm({ ...inviteForm, lastName: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="inv-email">Email <span className="text-red-500">*</span></Label>
                <Input
                  id="inv-email"
                  type="email"
                  placeholder="mario.rossi@esempio.it"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Ruolo</Label>
                <Select
                  value={inviteForm.role}
                  onValueChange={(v) => setInviteForm({ ...inviteForm, role: v as typeof inviteForm.role })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="property_admin">Admin Struttura</SelectItem>
                    <SelectItem value="sub_user">Utente</SelectItem>
                    <SelectItem value="consultant">Consulente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Organizzazione</Label>
                  <Select
                    value={inviteForm.organizationId || "any"}
                    onValueChange={(v) => setInviteForm({
                      ...inviteForm,
                      organizationId: v === "any" ? "" : v,
                      // Reset hotel if it no longer belongs to this org
                      hotelId: "",
                    })}
                  >
                    <SelectTrigger><SelectValue placeholder="Tutte" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Tutte le organizzazioni</SelectItem>
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Struttura <span className="text-red-500">*</span></Label>
                  <Select
                    value={inviteForm.hotelId}
                    onValueChange={(v) => {
                      const h = hotels.find((x) => x.id === v) as any
                      setInviteForm({
                        ...inviteForm,
                        hotelId: v,
                        // Auto-set org when picking a hotel
                        organizationId: h?.organization_id || inviteForm.organizationId,
                      })
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Seleziona struttura" /></SelectTrigger>
                    <SelectContent>
                      {inviteHotelOptions.map((h) => (
                        <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                      ))}
                      {inviteHotelOptions.length === 0 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Nessuna struttura per questa organizzazione</div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviteSubmitting}>
                  Annulla
                </Button>
                <Button onClick={handleInviteSubmit} disabled={inviteSubmitting}>
                  {inviteSubmitting ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Invio in corso...</>
                  ) : (
                    <><Send className="h-4 w-4 mr-2" />Invia invito</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica Utente</DialogTitle>
            <DialogDescription>
              {editUser
                ? `${[editUser.first_name, editUser.last_name].filter(Boolean).join(" ") || editUser.email}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4 py-4">
              {editUser.is_invitation ? (
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={editUser.email} disabled />
                  <p className="text-xs text-muted-foreground">
                    I dati anagrafici si potranno modificare dopo che l&apos;utente avra&apos; accettato l&apos;invito.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Nome</Label>
                      <Input
                        value={editFirstName}
                        onChange={(e) => setEditFirstName(e.target.value)}
                        placeholder="Nome"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Cognome</Label>
                      <Input
                        value={editLastName}
                        onChange={(e) => setEditLastName(e.target.value)}
                        placeholder="Cognome"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="email@esempio.com"
                    />
                    <p className="text-xs text-muted-foreground">
                      Cambiando l&apos;email viene aggiornato anche l&apos;accesso (login) dell&apos;utente.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Telefono</Label>
                      <Input
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="Telefono fisso"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Cellulare</Label>
                      <Input
                        value={editMobile}
                        onChange={(e) => setEditMobile(e.target.value)}
                        placeholder="Cellulare"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Ruolo aziendale</Label>
                    <Input
                      value={editJobTitle}
                      onChange={(e) => setEditJobTitle(e.target.value)}
                      placeholder="Es. Direttore, Revenue Manager..."
                    />
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label>Ruolo</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                    <SelectItem value="property_admin">Admin Struttura</SelectItem>
                    <SelectItem value="sub_user">Utente</SelectItem>
                    <SelectItem value="consultant">Consulente</SelectItem>
                    <SelectItem value="sales_agent">Venditore</SelectItem>
                  </SelectContent>
                </Select>
                {editRole === "sales_agent" && editUser?.role !== "sales_agent" && (
                  <p className="text-xs text-muted-foreground">
                    Salvando, verra&apos; creato (o riattivato) un profilo Venditore: l&apos;utente accedera&apos; all&apos;area
                    vendita. La gestione completa (commissioni, hotel, capo area) resta in Superadmin · Vendite.
                  </p>
                )}
                {editRole !== "sales_agent" && editUser?.role === "sales_agent" && (
                  <p className="text-xs text-amber-600">
                    Cambiando ruolo, il profilo Venditore verra&apos; disattivato e l&apos;utente non vedra&apos; piu&apos; l&apos;area
                    vendita.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Organizzazione</Label>
                <Select value={editOrgId} onValueChange={setEditOrgId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessuna</SelectItem>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Hotel (cambia automaticamente l'organizzazione)</Label>
                <Select value={editHotelId} onValueChange={(hotelId) => {
                  setEditHotelId(hotelId)
                  // Auto-set organization based on hotel's organization
                  if (hotelId !== "none") {
                    const hotel = hotels.find(h => h.id === hotelId) as any
                    if (hotel?.organization_id) {
                      setEditOrgId(hotel.organization_id)
                    }
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessun Hotel</SelectItem>
                    {hotels.map((hotel) => (
                      <SelectItem key={hotel.id} value={hotel.id}>
                        {hotel.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvataggio..." : "Salva Modifiche"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Properties Dialog (user_property_map) */}
      <Dialog open={!!propsUser} onOpenChange={(open) => !open && setPropsUser(null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Gestisci strutture</DialogTitle>
            <DialogDescription>
              {propsUser
                ? `Strutture a cui ${[propsUser.first_name, propsUser.last_name].filter(Boolean).join(" ") || propsUser.email} puo' accedere dalla dashboard.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {propsLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca struttura..."
                    value={propsSearch}
                    onChange={(e) => setPropsSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {propsSelected.size} selezionate
                </Badge>
              </div>

              <div className="max-h-[320px] overflow-y-auto rounded-lg border divide-y">
                {hotels
                  .filter((h) => h.name.toLowerCase().includes(propsSearch.toLowerCase()))
                  .map((h) => {
                    const checked = propsSelected.has(h.id)
                    return (
                      <label
                        key={h.id}
                        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50"
                      >
                        <Checkbox checked={checked} onCheckedChange={() => togglePropsHotel(h.id)} />
                        <div className="flex items-center gap-2 min-w-0">
                          <HotelIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate">{h.name}</span>
                        </div>
                      </label>
                    )
                  })}
                {hotels.filter((h) => h.name.toLowerCase().includes(propsSearch.toLowerCase())).length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Nessuna struttura trovata
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPropsUser(null)} disabled={propsSaving}>
              Annulla
            </Button>
            <Button onClick={handleSaveProperties} disabled={propsSaving || propsLoading}>
              {propsSaving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvataggio...</>
              ) : (
                "Salva strutture"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
