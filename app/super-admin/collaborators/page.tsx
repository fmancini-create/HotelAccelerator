"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Users, UserPlus, Edit, Eye, Ban, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type CollaboratorRole = "super_admin" | "platform_admin" | "support" | "sales" | "tech"
type CollaboratorStatus = "active" | "suspended"

interface Collaborator {
  id: string
  name: string
  email: string
  role: CollaboratorRole
  status: CollaboratorStatus
  last_login: string | null
  created_at: string
}

const getRoleBadgeVariant = (role: CollaboratorRole) => {
  switch (role) {
    case "super_admin":
      return "destructive"
    case "platform_admin":
      return "default"
    case "support":
      return "secondary"
    case "sales":
      return "outline"
    case "tech":
      return "outline"
    default:
      return "outline"
  }
}

const getStatusBadgeVariant = (status: CollaboratorStatus) => {
  return status === "active" ? "default" : "outline"
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return "Mai"
  return new Date(dateString).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function PlatformCollaboratorsPage() {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingCollaborator, setEditingCollaborator] = useState<Collaborator | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "support" as CollaboratorRole,
    status: "active" as CollaboratorStatus,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchCollaborators()
  }, [])

  const fetchCollaborators = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch("/api/super-admin/collaborators")
      if (!response.ok) {
        throw new Error("Failed to fetch collaborators")
      }
      const data = await response.json()
      setCollaborators(data.collaborators || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      console.error("Error fetching collaborators:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenAddModal = () => {
    setFormData({
      name: "",
      email: "",
      role: "support",
      status: "active",
    })
    setEditingCollaborator(null)
    setIsAddModalOpen(true)
  }

  const handleOpenEditModal = (collaborator: Collaborator) => {
    setFormData({
      name: collaborator.name,
      email: collaborator.email,
      role: collaborator.role,
      status: collaborator.status,
    })
    setEditingCollaborator(collaborator)
    setIsAddModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsAddModalOpen(false)
    setEditingCollaborator(null)
  }

  const handleSave = async () => {
    try {
      setSaving(true)

      if (editingCollaborator) {
        const response = await fetch(`/api/super-admin/collaborators/${editingCollaborator.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || "Failed to update collaborator")
        }
      } else {
        const response = await fetch("/api/super-admin/collaborators", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || "Failed to create collaborator")
        }
      }

      await fetchCollaborators()
      handleCloseModal()
    } catch (err) {
      console.error("Error saving collaborator:", err)
      alert(err instanceof Error ? err.message : "Failed to save collaborator")
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async (collaborator: Collaborator) => {
    const endpoint = collaborator.status === "active" ? "suspend" : "activate"
    try {
      const response = await fetch(`/api/super-admin/collaborators/${collaborator.id}/${endpoint}`, {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error(`Failed to ${endpoint} collaborator`)
      }

      await fetchCollaborators()
    } catch (err) {
      console.error(`Error toggling collaborator status:`, err)
      alert(`Failed to ${endpoint} collaborator`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center">
        <p className="text-[#8b8b8b]">Loading collaborators...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={fetchCollaborators}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      {/* Header */}
      <header className="bg-white border-b border-[#e5e5e5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-[#8b7355]" />
              <h1 className="text-xl font-serif text-[#5c5c5c]">Platform Collaborators</h1>
            </div>
            <Button onClick={handleOpenAddModal} className="bg-[#8b7355] hover:bg-[#6d5940] text-white">
              <UserPlus className="w-4 h-4 mr-2" />
              Add Collaborator
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Table */}
        <div className="bg-white rounded-xl border border-[#e5e5e5] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#f8f7f4] border-b border-[#e5e5e5]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#8b8b8b] uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#8b8b8b] uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#8b8b8b] uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#8b8b8b] uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[#8b8b8b] uppercase tracking-wider">
                    Last Login
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-[#8b8b8b] uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-[#e5e5e5]">
                {collaborators.map((collaborator) => (
                  <tr key={collaborator.id} className={collaborator.status === "suspended" ? "opacity-50" : ""}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-[#5c5c5c]">{collaborator.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-[#8b8b8b]">{collaborator.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={getRoleBadgeVariant(collaborator.role)}>{collaborator.role}</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={getStatusBadgeVariant(collaborator.status)}>{collaborator.status}</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#8b8b8b]">
                      {formatDate(collaborator.last_login)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/super-admin/collaborators/${collaborator.id}`}>
                          <Button variant="outline" size="sm">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button variant="outline" size="sm" onClick={() => handleOpenEditModal(collaborator)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        {collaborator.role !== "super_admin" && (
                          <Button variant="outline" size="sm" onClick={() => handleToggleStatus(collaborator)}>
                            {collaborator.status === "active" ? (
                              <Ban className="w-4 h-4" />
                            ) : (
                              <CheckCircle className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add/Edit Collaborator Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCollaborator ? "Edit Collaborator" : "Add Collaborator"}</DialogTitle>
            <DialogDescription>
              {editingCollaborator ? "Update collaborator information" : "Add a new platform collaborator"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Enter email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={formData.role}
                onValueChange={(value: CollaboratorRole) => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">SUPER_ADMIN</SelectItem>
                  <SelectItem value="platform_admin">PLATFORM_ADMIN</SelectItem>
                  <SelectItem value="support">SUPPORT</SelectItem>
                  <SelectItem value="sales">SALES</SelectItem>
                  <SelectItem value="tech">TECH</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value: CollaboratorStatus) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseModal} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-[#8b7355] hover:bg-[#6d5940]" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
