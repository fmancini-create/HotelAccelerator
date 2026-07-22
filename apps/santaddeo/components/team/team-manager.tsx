"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { UserPlus, Mail, Phone, MoreVertical, Trash2, Edit } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { Profile } from "@/lib/types/database"
import { InviteTeamMemberDialog } from "./invite-team-member-dialog"
import { EditTeamMemberDialog } from "./edit-team-member-dialog"

interface TeamManagerProps {
  organizationId: string
  currentUserRole: string
  teamMembers: Profile[]
  onRefresh: () => void
}

export function TeamManager({ organizationId, currentUserRole, teamMembers, onRefresh }: TeamManagerProps) {
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<Profile | null>(null)

  const canManageTeam = currentUserRole === "super_admin" || currentUserRole === "property_admin"

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "super_admin":
        return "bg-purple-500"
      case "property_admin":
        return "bg-blue-500"
      case "consultant":
        return "bg-orange-500"
      case "sub_user":
        return "bg-gray-500"
      default:
        return "bg-gray-500"
    }
  }

  const handleDeactivate = async (memberId: string) => {
    if (!confirm("Sei sicuro di voler disattivare questo membro del team?")) return

    try {
      const response = await fetch(`/api/team/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: false }),
      })

      if (!response.ok) throw new Error("Failed to deactivate team member")

      onRefresh()
    } catch (error) {
      console.error("Error deactivating team member:", error)
      alert("Errore durante la disattivazione del membro del team")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Team</h2>
          <p className="text-muted-foreground">Gestisci i membri del tuo team e i loro permessi</p>
        </div>
        {canManageTeam && (
          <Button onClick={() => setInviteDialogOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Invita Membro
          </Button>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Ruolo</TableHead>
              <TableHead>Posizione</TableHead>
              <TableHead>Contatti</TableHead>
              <TableHead>Stato</TableHead>
              {canManageTeam && <TableHead className="text-right">Azioni</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {teamMembers.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">
                  {member.first_name && member.last_name
                    ? `${member.first_name} ${member.last_name}`
                    : "Non specificato"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    {member.email}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={getRoleBadgeColor(member.role)}>{member.role}</Badge>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {member.job_title && <div className="font-medium">{member.job_title}</div>}
                    {member.department && <div className="text-muted-foreground">{member.department}</div>}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm space-y-1">
                    {member.phone && (
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {member.phone}
                      </div>
                    )}
                    {member.mobile && (
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {member.mobile}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={member.is_active ? "default" : "secondary"}>
                    {member.is_active ? "Attivo" : "Disattivato"}
                  </Badge>
                </TableCell>
                {canManageTeam && (
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingMember(member)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Modifica
                        </DropdownMenuItem>
                        {member.is_active && (
                          <DropdownMenuItem onClick={() => handleDeactivate(member.id)} className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Disattiva
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <InviteTeamMemberDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        organizationId={organizationId}
        onSuccess={onRefresh}
      />

      {editingMember && (
        <EditTeamMemberDialog
          open={!!editingMember}
          onOpenChange={(open) => !open && setEditingMember(null)}
          member={editingMember}
          onSuccess={onRefresh}
        />
      )}
    </div>
  )
}
