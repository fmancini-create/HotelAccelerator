"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Users, Shield, ShieldCheck, Edit3, Trash2, Plus, Check, X, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAdminAuth, getRoleLabel, type AdminUser } from "@/lib/admin-hooks"

type UserRole = "super_admin" | "admin" | "editor"

const DEFAULT_USERS: AdminUser[] = [
  {
    id: "1",
    email: "f.mancini@ibarronci.com",
    name: "Filippo Mancini",
    role: "super_admin",
    can_upload: true,
    can_delete: true,
    can_move: true,
    can_manage_users: true,
  },
]

function getLocalUsers(): AdminUser[] {
  if (typeof window === "undefined") return DEFAULT_USERS
  const stored = localStorage.getItem("admin_users_list")
  return stored ? JSON.parse(stored) : DEFAULT_USERS
}

function saveLocalUsers(users: AdminUser[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem("admin_users_list", JSON.stringify(users))
}

export default function AdminUsersPage() {
  const { isLoading, adminUser, logout } = useAdminAuth()
  const [users, setUsers] = useState<AdminUser[]>(getLocalUsers())
  const [showAddUser, setShowAddUser] = useState(false)
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    name: "",
    role: "editor" as UserRole,
  })
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#8b7355]"></div>
      </div>
    )
  }

  if (!adminUser) {
    return null
  }

  if (!adminUser.can_manage_users) {
    return (
      <main className="min-h-screen bg-[#f8f7f4] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md">
          <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-serif text-[#5c5c5c] mb-2">Accesso Negato</h1>
          <p className="text-[#8b8b8b] mb-6">
            Non hai i permessi per gestire gli utenti. Solo i Super Admin possono accedere a questa sezione.
          </p>
          <Link href="/admin/dashboard">
            <Button className="bg-[#8b7355] hover:bg-[#6b5a45]">Torna alla Dashboard</Button>
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

  const getPermissionsForRole = (role: UserRole) => {
    switch (role) {
      case "super_admin":
        return { can_upload: true, can_delete: true, can_move: true, can_manage_users: true }
      case "admin":
        return { can_upload: true, can_delete: true, can_move: true, can_manage_users: false }
      case "editor":
        return { can_upload: true, can_delete: false, can_move: true, can_manage_users: false }
    }
  }

  const handleCreateUser = () => {
    setError("")
    setSuccess("")

    if (!newUser.email || !newUser.password || !newUser.name) {
      setError("Tutti i campi sono obbligatori")
      return
    }

    // Check if user already exists
    if (users.find((u) => u.email.toLowerCase() === newUser.email.toLowerCase())) {
      setError("Un utente con questa email esiste già")
      return
    }

    const newUserData: AdminUser = {
      id: Date.now().toString(),
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      ...getPermissionsForRole(newUser.role),
    }

    const updatedUsers = [...users, newUserData]
    setUsers(updatedUsers)
    saveLocalUsers(updatedUsers)

    // Save password separately
    const customPasswords = JSON.parse(localStorage.getItem("admin_custom_passwords") || "{}")
    customPasswords[newUser.email.toLowerCase()] = newUser.password
    localStorage.setItem("admin_custom_passwords", JSON.stringify(customPasswords))

    setSuccess(`Utente ${newUser.email} creato con successo`)
    setShowAddUser(false)
    setNewUser({ email: "", password: "", name: "", role: "editor" })
  }

  const handleDeleteUser = (userId: string, userEmail: string) => {
    if (!confirm(`Vuoi eliminare l'utente ${userEmail}?`)) return

    const updatedUsers = users.filter((u) => u.id !== userId)
    setUsers(updatedUsers)
    saveLocalUsers(updatedUsers)
    setSuccess("Utente eliminato con successo")
  }

  return (
    <main className="min-h-screen bg-[#f8f7f4]">
      {/* Header */}
      <header className="bg-white border-b border-[#e5e5e5] sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/admin/dashboard" className="text-[#8b8b8b] hover:text-[#5c5c5c]">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-xl font-serif text-[#5c5c5c]">Gestione Utenti</h1>
                <p className="text-sm text-[#8b8b8b]">
                  Connesso come {adminUser.name} ({getRoleLabel(adminUser.role)})
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={() => setShowAddUser(true)} className="bg-green-600 hover:bg-green-700 text-white">
                <Plus className="w-4 h-4 mr-2" />
                Nuovo Utente
              </Button>
              <Button variant="outline" onClick={logout} className="text-[#8b8b8b] bg-transparent">
                <LogOut className="w-4 h-4 mr-2" />
                Esci
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {success}
          </div>
        )}

        {/* Add User Form */}
        {showAddUser && (
          <div className="bg-white rounded-xl shadow-sm border border-[#e5e5e5] p-6 mb-8">
            <h2 className="text-lg font-medium text-[#5c5c5c] mb-4">Aggiungi Nuovo Utente</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                className="h-10 px-3 rounded-md border border-[#e5e5e5] text-[#5c5c5c]"
              >
                <option value="editor">Editor</option>
                <option value="admin">Amministratore</option>
                <option value="super_admin">Super Admin</option>
              </select>
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

        {/* Users List */}
        <div className="bg-white rounded-xl shadow-sm border border-[#e5e5e5] overflow-hidden">
          <div className="p-4 border-b border-[#e5e5e5] flex items-center gap-2">
            <Users className="w-5 h-5 text-[#8b7355]" />
            <h2 className="font-medium text-[#5c5c5c]">Utenti Registrati ({users.length})</h2>
          </div>

          <div className="divide-y divide-[#e5e5e5]">
            {users.map((user) => (
              <div key={user.id} className="p-4 hover:bg-[#f8f7f4] transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-[#8b7355]/10 flex items-center justify-center">
                      {getRoleIcon(user.role)}
                    </div>
                    <div>
                      <h3 className="font-medium text-[#5c5c5c]">{user.name}</h3>
                      <p className="text-sm text-[#8b8b8b]">{user.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(user.role)}`}
                    >
                      {getRoleLabel(user.role)}
                    </span>

                    {/* Permissions badges */}
                    <div className="hidden md:flex gap-2">
                      {user.can_upload && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">Upload</span>
                      )}
                      {user.can_delete && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">Elimina</span>
                      )}
                      {user.can_move && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">Sposta</span>
                      )}
                      {user.can_manage_users && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">Utenti</span>
                      )}
                    </div>

                    {/* Actions - Don't allow deleting super_admin */}
                    {user.role !== "super_admin" && (
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-600"
                          onClick={() => handleDeleteUser(user.id!, user.email)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Permissions Legend */}
        <div className="mt-8 bg-white rounded-xl shadow-sm border border-[#e5e5e5] p-6">
          <h3 className="font-medium text-[#5c5c5c] mb-4">Legenda Ruoli</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-6 h-6 text-amber-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-[#5c5c5c]">Super Admin</h4>
                <p className="text-sm text-[#8b8b8b]">
                  Accesso completo a tutte le funzionalita, inclusa la gestione utenti.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="w-6 h-6 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-[#5c5c5c]">Amministratore</h4>
                <p className="text-sm text-[#8b8b8b]">
                  Puo caricare, eliminare e spostare foto. Non puo gestire utenti.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Edit3 className="w-6 h-6 text-green-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-[#5c5c5c]">Editor</h4>
                <p className="text-sm text-[#8b8b8b]">
                  Puo caricare e spostare foto. Non puo eliminare o gestire utenti.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
