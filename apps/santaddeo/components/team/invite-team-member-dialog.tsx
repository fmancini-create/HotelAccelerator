"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { UserRole } from "@/lib/types/database"

interface InviteTeamMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  onSuccess: () => void
}

export function InviteTeamMemberDialog({ open, onOpenChange, organizationId, onSuccess }: InviteTeamMemberDialogProps) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<UserRole>("viewer")
  const [loading, setLoading] = useState(false)

  const handleInvite = async () => {
    if (!email || !role) return

    setLoading(true)
    try {
      const response = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          email,
          role,
        }),
      })

      if (!response.ok) throw new Error("Failed to send invitation")

      alert("Invito inviato con successo!")
      setEmail("")
      setRole("viewer")
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      console.error("Error sending invitation:", error)
      alert("Errore durante l'invio dell'invito")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invita Membro del Team</DialogTitle>
          <DialogDescription>Invia un invito via email per aggiungere un nuovo membro al team</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="nome@esempio.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Ruolo</Label>
            <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="consultant">Consultant</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleInvite} disabled={loading || !email || !role}>
            {loading ? "Invio..." : "Invia Invito"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
