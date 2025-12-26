"use client"

import { useState, useEffect, use } from "react"
import Link from "next/link"
import { ArrowLeft, Users, UserPlus, X, Check, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AdminHeader } from "@/components/admin/admin-header"

interface GroupMember {
  id: string
  user_id: string
  user_name: string
  user_email: string
}

interface AvailableUser {
  id: string
  name: string
  email: string
}

export default function GroupMembersPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params)
  const [group, setGroup] = useState<{ id: string; name: string; color: string } | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([])
  const [showAddMember, setShowAddMember] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [groupId])

  async function loadData() {
    try {
      const [groupRes, membersRes, usersRes] = await Promise.all([
        fetch(`/api/admin/groups/${groupId}`),
        fetch(`/api/admin/groups/${groupId}/members`),
        fetch("/api/admin/users"),
      ])

      if (groupRes.ok) {
        const data = await groupRes.json()
        setGroup(data.group)
      }
      if (membersRes.ok) {
        const data = await membersRes.json()
        setMembers(data.members || [])
      }
      if (usersRes.ok) {
        const data = await usersRes.json()
        setAvailableUsers(data.users || [])
      }
    } catch (e) {
      console.error("Error loading data:", e)
    } finally {
      setLoading(false)
    }
  }

  async function addMember(userId: string) {
    try {
      const res = await fetch(`/api/admin/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      })
      if (res.ok) {
        loadData()
        setShowAddMember(false)
      }
    } catch (e) {
      console.error("Error adding member:", e)
    }
  }

  async function removeMember(memberId: string) {
    if (!confirm("Rimuovere questo membro dal gruppo?")) return
    try {
      const res = await fetch(`/api/admin/groups/${groupId}/members/${memberId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        loadData()
      }
    } catch (e) {
      console.error("Error removing member:", e)
    }
  }

  const memberUserIds = members.map((m) => m.user_id)
  const filteredAvailableUsers = availableUsers.filter(
    (u) =>
      !memberUserIds.includes(u.id) &&
      (u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase())),
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <AdminHeader
          title={`Membri: ${group?.name || ""}`}
          subtitle="Gestisci i membri di questo gruppo"
          breadcrumbs={[
            { label: "Team", href: "/admin/users" },
            { label: "Gruppi", href: "/admin/users?tab=groups" },
            { label: group?.name || "", href: `/admin/users/groups/${groupId}/members` },
          ]}
          actions={
            <Link href="/admin/users">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Indietro
              </Button>
            </Link>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Membri attuali */}
          <div className="bg-card rounded-xl shadow-sm border">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                <h2 className="font-medium">Membri del gruppo ({members.length})</h2>
              </div>
              <Button size="sm" onClick={() => setShowAddMember(true)}>
                <UserPlus className="w-4 h-4 mr-1" />
                Aggiungi
              </Button>
            </div>

            <div className="divide-y">
              {members.map((member) => (
                <div key={member.id} className="p-4 flex items-center justify-between hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                      style={{ backgroundColor: group?.color || "#6b7280" }}
                    >
                      {member.user_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{member.user_name}</p>
                      <p className="text-sm text-muted-foreground">{member.user_email}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => removeMember(member.id)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}

              {members.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Nessun membro in questo gruppo</p>
                </div>
              )}
            </div>
          </div>

          {/* Aggiungi membri */}
          {showAddMember && (
            <div className="bg-card rounded-xl shadow-sm border">
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="font-medium">Aggiungi membri</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowAddMember(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="p-4">
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca utenti..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {filteredAvailableUsers.map((user) => (
                    <div
                      key={user.id}
                      className="p-3 border rounded-lg flex items-center justify-between hover:bg-muted/50"
                    >
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                      <Button size="sm" onClick={() => addMember(user.id)}>
                        <Check className="w-4 h-4 mr-1" />
                        Aggiungi
                      </Button>
                    </div>
                  ))}

                  {filteredAvailableUsers.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">Nessun utente disponibile</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
