"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Users,
  Shield,
  ShieldCheck,
  Edit3,
  Trash2,
  Plus,
  Check,
  X,
  UserPlus,
  Settings,
  Ligature as Signature,
  UsersRound,
  Lock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAdminAuth, getRoleLabel, type AdminUser } from "@/lib/admin-hooks"
import { AdminHeader } from "@/components/admin/admin-header"

type UserRole = "super_admin" | "admin" | "editor"

interface UserGroup {
  id: string
  name: string
  description: string
  color: string
  members: string[] // user IDs
  permissions: GroupPermission[]
}

interface GroupPermission {
  channel_type: string
  channel_id: string | null
  can_read: boolean
  can_write: boolean
  can_manage: boolean
}

interface ExtendedAdminUser extends AdminUser {
  signature?: string
  signature_html?: string
  is_tenant_admin?: boolean
  groups?: string[]
}

export default function AdminUsersPage() {
  const { isLoading, adminUser, logout } = useAdminAuth()
  const [users, setUsers] = useState<ExtendedAdminUser[]>([])
  const [groups, setGroups] = useState<UserGroup[]>([])
  const [showAddUser, setShowAddUser] = useState(false)
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [editingSignature, setEditingSignature] = useState<string | null>(null)
  const [signatureText, setSignatureText] = useState("")
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    name: "",
    role: "editor" as UserRole,
    is_tenant_admin: false,
  })
  const [newGroup, setNewGroup] = useState({
    name: "",
    description: "",
    color: "#6b7280",
  })
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [activeTab, setActiveTab] = useState("users")

  // Carica utenti e gruppi dal database
  useEffect(() => {
    loadUsersAndGroups()
  }, [])

  async function loadUsersAndGroups() {
    try {
      const [usersRes, groupsRes] = await Promise.all([fetch("/api/admin/users"), fetch("/api/admin/groups")])
      if (usersRes.ok) {
        const data = await usersRes.json()
        setUsers(data.users || [])
      }
      if (groupsRes.ok) {
        const data = await groupsRes.json()
        setGroups(data.groups || [])
      }
    } catch (e) {
      console.error("Error loading data:", e)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!adminUser) {
    return null
  }

  // Solo tenant admin può gestire utenti e gruppi
  const isTenantAdmin = adminUser.role === "super_admin" || adminUser.role === "admin"

  if (!isTenantAdmin) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card rounded-2xl shadow-xl p-8 text-center max-w-md border">
          <Lock className="w-16 h-16 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-serif text-foreground mb-2">Accesso Negato</h1>
          <p className="text-muted-foreground mb-6">
            Solo gli amministratori del tenant possono gestire utenti e gruppi.
          </p>
          <Link href="/admin/dashboard">
            <Button>Torna alla Dashboard</Button>
          </Link>
        </div>
      </main>
    )
  }

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case "super_admin":
        return <ShieldCheck className="w-5 h-5 text-amber-600" />
      case "admin":
        return <Shield className="w-5 h-5 text-blue-600" />
      case "editor":
        return <Edit3 className="w-5 h-5 text-green-600" />
    }
  }

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case "super_admin":
        return "bg-amber-100 text-amber-800 border-amber-200"
      case "admin":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "editor":
        return "bg-green-100 text-green-800 border-green-200"
    }
  }

  const handleCreateUser = async () => {
    setError("")
    setSuccess("")

    if (!newUser.email || !newUser.password || !newUser.name) {
      setError("Tutti i campi sono obbligatori")
      return
    }

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      })

      if (res.ok) {
        setSuccess(`Utente ${newUser.email} creato con successo`)
        setShowAddUser(false)
        setNewUser({ email: "", password: "", name: "", role: "editor", is_tenant_admin: false })
        loadUsersAndGroups()
      } else {
        const data = await res.json()
        setError(data.error || "Errore nella creazione utente")
      }
    } catch (e) {
      setError("Errore di rete")
    }
  }

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!confirm(`Vuoi eliminare l'utente ${userEmail}?`)) return

    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" })
      if (res.ok) {
        setSuccess("Utente eliminato con successo")
        loadUsersAndGroups()
      }
    } catch (e) {
      setError("Errore nella eliminazione")
    }
  }

  const handleSaveSignature = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/signature`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: signatureText }),
      })

      if (res.ok) {
        setSuccess("Firma salvata con successo")
        setEditingSignature(null)
        loadUsersAndGroups()
      }
    } catch (e) {
      setError("Errore nel salvataggio firma")
    }
  }

  const handleCreateGroup = async () => {
    if (!newGroup.name) {
      setError("Il nome del gruppo è obbligatorio")
      return
    }

    try {
      const res = await fetch("/api/admin/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newGroup),
      })

      if (res.ok) {
        setSuccess(`Gruppo "${newGroup.name}" creato con successo`)
        setShowAddGroup(false)
        setNewGroup({ name: "", description: "", color: "#6b7280" })
        loadUsersAndGroups()
      }
    } catch (e) {
      setError("Errore nella creazione gruppo")
    }
  }

  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    if (!confirm(`Vuoi eliminare il gruppo "${groupName}"?`)) return

    try {
      const res = await fetch(`/api/admin/groups/${groupId}`, { method: "DELETE" })
      if (res.ok) {
        setSuccess("Gruppo eliminato con successo")
        loadUsersAndGroups()
      }
    } catch (e) {
      setError("Errore nella eliminazione")
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <AdminHeader
          title="Team & Permessi"
          subtitle="Gestisci utenti, gruppi e permessi sui canali"
          breadcrumbs={[{ label: "Team", href: "/admin/users" }]}
        />

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {success}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              Utenti
            </TabsTrigger>
            <TabsTrigger value="groups" className="gap-2">
              <UsersRound className="h-4 w-4" />
              Gruppi
            </TabsTrigger>
            <TabsTrigger value="signatures" className="gap-2">
              <Signature className="h-4 w-4" />
              Firme
            </TabsTrigger>
          </TabsList>

          {/* TAB UTENTI */}
          <TabsContent value="users" className="space-y-6">
            <div className="flex justify-end">
              <Button onClick={() => setShowAddUser(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Nuovo Utente
              </Button>
            </div>

            {showAddUser && (
              <div className="bg-card rounded-xl shadow-sm border p-6">
                <h2 className="text-lg font-medium mb-4">Aggiungi Nuovo Utente</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <Input
                    placeholder="Nome"
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  />
                  <Input
                    type="email"
                    placeholder="Email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  />
                  <Input
                    type="password"
                    placeholder="Password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  />
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
                    className="h-10 px-3 rounded-md border text-sm bg-background"
                  >
                    <option value="editor">Editor</option>
                    <option value="admin">Amministratore</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newUser.is_tenant_admin}
                      onChange={(e) => setNewUser({ ...newUser, is_tenant_admin: e.target.checked })}
                      className="rounded"
                    />
                    Admin Tenant
                  </label>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button onClick={handleCreateUser} className="bg-green-600 hover:bg-green-700">
                    <Check className="w-4 h-4 mr-2" />
                    Salva
                  </Button>
                  <Button variant="outline" onClick={() => setShowAddUser(false)}>
                    <X className="w-4 h-4 mr-2" />
                    Annulla
                  </Button>
                </div>
              </div>
            )}

            <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
              <div className="p-4 border-b flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                <h2 className="font-medium">Utenti ({users.length})</h2>
              </div>

              <div className="divide-y">
                {users.map((user) => (
                  <div key={user.id} className="p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                          {getRoleIcon(user.role)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{user.name}</h3>
                            {user.is_tenant_admin && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                                Admin Tenant
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                          {user.groups && user.groups.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {user.groups.map((groupId) => {
                                const group = groups.find((g) => g.id === groupId)
                                return group ? (
                                  <span
                                    key={groupId}
                                    className="px-2 py-0.5 text-xs rounded-full text-white"
                                    style={{ backgroundColor: group.color }}
                                  >
                                    {group.name}
                                  </span>
                                ) : null
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(user.role)}`}
                        >
                          {getRoleLabel(user.role)}
                        </span>

                        {user.role !== "super_admin" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteUser(user.id!, user.email)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* TAB GRUPPI */}
          <TabsContent value="groups" className="space-y-6">
            <div className="flex justify-end">
              <Button onClick={() => setShowAddGroup(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nuovo Gruppo
              </Button>
            </div>

            {showAddGroup && (
              <div className="bg-card rounded-xl shadow-sm border p-6">
                <h2 className="text-lg font-medium mb-4">Crea Nuovo Gruppo</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    placeholder="Nome gruppo (es: Reception)"
                    value={newGroup.name}
                    onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                  />
                  <Input
                    placeholder="Descrizione"
                    value={newGroup.description}
                    onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-sm">Colore:</label>
                    <input
                      type="color"
                      value={newGroup.color}
                      onChange={(e) => setNewGroup({ ...newGroup, color: e.target.value })}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button onClick={handleCreateGroup} className="bg-green-600 hover:bg-green-700">
                    <Check className="w-4 h-4 mr-2" />
                    Crea Gruppo
                  </Button>
                  <Button variant="outline" onClick={() => setShowAddGroup(false)}>
                    <X className="w-4 h-4 mr-2" />
                    Annulla
                  </Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groups.map((group) => (
                <div key={group.id} className="bg-card rounded-xl shadow-sm border p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: group.color + "20" }}
                      >
                        <UsersRound className="w-5 h-5" style={{ color: group.color }} />
                      </div>
                      <div>
                        <h3 className="font-medium">{group.name}</h3>
                        <p className="text-sm text-muted-foreground">{group.members?.length || 0} membri</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleDeleteGroup(group.id, group.name)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {group.description && <p className="text-sm text-muted-foreground mb-4">{group.description}</p>}

                  <div className="flex gap-2">
                    <Link href={`/admin/users/groups/${group.id}/members`}>
                      <Button variant="outline" size="sm">
                        <Users className="w-4 h-4 mr-1" />
                        Membri
                      </Button>
                    </Link>
                    <Link href={`/admin/users/groups/${group.id}/permissions`}>
                      <Button variant="outline" size="sm">
                        <Settings className="w-4 h-4 mr-1" />
                        Permessi
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}

              {groups.length === 0 && (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  <UsersRound className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nessun gruppo creato</p>
                  <p className="text-sm">Crea gruppi per organizzare il team e assegnare permessi sui canali</p>
                </div>
              )}
            </div>

            {/* Info box */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h4 className="font-medium text-blue-900 mb-2">Come funzionano i gruppi?</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Crea gruppi come "Reception", "Spa", "Ristorante" per organizzare il team</li>
                <li>• Assegna utenti a uno o più gruppi</li>
                <li>• Configura i permessi di ogni gruppo sui canali di comunicazione</li>
                <li>• Gli utenti ereditano i permessi di tutti i gruppi a cui appartengono</li>
              </ul>
            </div>
          </TabsContent>

          {/* TAB FIRME */}
          <TabsContent value="signatures" className="space-y-6">
            <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
              <div className="p-4 border-b flex items-center gap-2">
                <Signature className="w-5 h-5 text-primary" />
                <h2 className="font-medium">Firme Email</h2>
              </div>

              <div className="p-4">
                <p className="text-sm text-muted-foreground mb-6">
                  Configura la firma email per ogni utente. La firma verrà automaticamente aggiunta alle email inviate
                  dal sistema.
                </p>

                <div className="space-y-4">
                  {users.map((user) => (
                    <div key={user.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            {getRoleIcon(user.role)}
                          </div>
                          <div>
                            <h3 className="font-medium">{user.name}</h3>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                        {editingSignature !== user.id ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingSignature(user.id!)
                              setSignatureText(user.signature || "")
                            }}
                          >
                            <Edit3 className="w-4 h-4 mr-1" />
                            {user.signature ? "Modifica" : "Aggiungi"} Firma
                          </Button>
                        ) : (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleSaveSignature(user.id!)}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Salva
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setEditingSignature(null)}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {editingSignature === user.id ? (
                        <textarea
                          value={signatureText}
                          onChange={(e) => setSignatureText(e.target.value)}
                          placeholder={`Cordiali saluti,\n${user.name}\nVilla I Barronci\nTel: +39 055 123 4567`}
                          className="w-full h-32 p-3 border rounded-lg text-sm font-mono bg-background"
                        />
                      ) : user.signature ? (
                        <div className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap">{user.signature}</div>
                      ) : (
                        <div className="text-sm text-muted-foreground italic">Nessuna firma configurata</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
