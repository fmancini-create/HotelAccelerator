"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Search, Clock, CheckCircle2, XCircle, AlertTriangle, Building2, User, Calendar, Mail } from "lucide-react"
import { toast } from "sonner"

interface CommissionRequest {
  id: string
  hotel_id: string
  user_id: string
  organization_id: string | null
  algorithm_type: string
  auto_pilot: boolean
  requested_at: string
  status: "pending" | "approved" | "rejected" | "cancelled"
  status_changed_at: string | null
  status_notes: string | null
  contract_accepted: boolean
  admin_notified: boolean
  user_email_sent: boolean
  notes: string | null
  hotel?: {
    id: string
    name: string
    total_rooms: number
    city: string | null
  } | null
  profile?: {
    email: string
    first_name: string | null
    full_name: string | null
  } | null
  organization?: {
    name: string
    company_name: string | null
  } | null
}

interface Props {
  requests: CommissionRequest[]
}

export function CommissionRequestsManager({ requests }: Props) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>("pending")
  const [selectedRequest, setSelectedRequest] = useState<CommissionRequest | null>(null)
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null)
  const [statusNotes, setStatusNotes] = useState("")
  const [processing, setProcessing] = useState(false)

  const filteredRequests = requests.filter((req) => {
    const hotelName = req.hotel?.name?.toLowerCase() || ""
    const userEmail = req.profile?.email?.toLowerCase() || ""
    const orgName = req.organization?.name?.toLowerCase() || req.organization?.company_name?.toLowerCase() || ""
    const q = searchQuery.toLowerCase()
    const matchesSearch = !q || hotelName.includes(q) || userEmail.includes(q) || orgName.includes(q)
    const matchesFilter = filterStatus === "all" || req.status === filterStatus
    return matchesSearch && matchesFilter
  })

  const pendingCount = requests.filter(r => r.status === "pending").length

  const handleAction = async () => {
    if (!selectedRequest || !actionType) return
    setProcessing(true)

    try {
      const res = await fetch(`/api/superadmin/commission-requests/${selectedRequest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionType,
          notes: statusNotes,
        }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || "Errore elaborazione richiesta")
      }

      toast.success(actionType === "approve" ? "Richiesta approvata" : "Richiesta rifiutata")
      setSelectedRequest(null)
      setActionType(null)
      setStatusNotes("")
      router.refresh()
    } catch (err: any) {
      toast.error(err.message || "Errore nell'elaborazione")
    } finally {
      setProcessing(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge className="bg-amber-500 gap-1">
            <Clock className="h-3 w-3" />
            In Attesa
          </Badge>
        )
      case "approved":
        return (
          <Badge className="bg-green-600 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Approvata
          </Badge>
        )
      case "rejected":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Rifiutata
          </Badge>
        )
      case "cancelled":
        return (
          <Badge variant="secondary" className="gap-1">
            <XCircle className="h-3 w-3" />
            Annullata
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              Richieste Piano Commissione
              {pendingCount > 0 && (
                <Badge className="bg-amber-500">{pendingCount} in attesa</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Gestisci le richieste di attivazione del piano a commissione
            </CardDescription>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={filterStatus === "pending" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("pending")}
            >
              In Attesa ({requests.filter(r => r.status === "pending").length})
            </Button>
            <Button
              variant={filterStatus === "approved" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("approved")}
            >
              Approvate
            </Button>
            <Button
              variant={filterStatus === "rejected" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("rejected")}
            >
              Rifiutate
            </Button>
            <Button
              variant={filterStatus === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("all")}
            >
              Tutte ({requests.length})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per hotel, email o organizzazione..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hotel</TableHead>
                <TableHead>Richiedente</TableHead>
                <TableHead>Organizzazione</TableHead>
                <TableHead>Algoritmo</TableHead>
                <TableHead>Data Richiesta</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Notifiche</TableHead>
                <TableHead>Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nessuna richiesta trovata
                  </TableCell>
                </TableRow>
              ) : (
                filteredRequests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <div className="flex flex-col">
                          <span className="font-medium">{req.hotel?.name || "Hotel sconosciuto"}</span>
                          <span className="text-xs text-muted-foreground">
                            {req.hotel?.total_rooms || 0} camere - {req.hotel?.city || "N/D"}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div className="flex flex-col">
                          <span className="text-sm">
                            {req.profile?.first_name || req.profile?.full_name || "Utente"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {req.profile?.email || "N/D"}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {req.organization?.name || req.organization?.company_name || "N/D"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {req.algorithm_type === "basic" ? "Base" : "Avanzato"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {new Date(req.requested_at).toLocaleDateString("it-IT", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(req.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {req.admin_notified && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Mail className="h-3 w-3" />
                            Admin
                          </Badge>
                        )}
                        {req.user_email_sent && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Mail className="h-3 w-3" />
                            User
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {req.status === "pending" ? (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => {
                              setSelectedRequest(req)
                              setActionType("approve")
                            }}
                          >
                            Approva
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setSelectedRequest(req)
                              setActionType("reject")
                            }}
                          >
                            Rifiuta
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedRequest(req)
                            setActionType(null)
                          }}
                        >
                          Dettagli
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* Action Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "approve" && "Approva Richiesta"}
              {actionType === "reject" && "Rifiuta Richiesta"}
              {!actionType && "Dettagli Richiesta"}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest?.hotel?.name} - Richiesta del{" "}
              {selectedRequest && new Date(selectedRequest.requested_at).toLocaleDateString("it-IT")}
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Hotel</Label>
                  <p className="font-medium">{selectedRequest.hotel?.name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Camere</Label>
                  <p className="font-medium">{selectedRequest.hotel?.total_rooms}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Richiedente</Label>
                  <p className="font-medium">{selectedRequest.profile?.email}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Algoritmo</Label>
                  <p className="font-medium">{selectedRequest.algorithm_type === "basic" ? "Base" : "Avanzato"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Auto-Pilot</Label>
                  <p className="font-medium">{selectedRequest.auto_pilot ? "Si" : "No"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Stato</Label>
                  <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
                </div>
              </div>

              {selectedRequest.notes && (
                <div>
                  <Label className="text-muted-foreground">Note richiesta</Label>
                  <p className="text-sm bg-muted p-2 rounded mt-1">{selectedRequest.notes}</p>
                </div>
              )}

              {selectedRequest.status_notes && (
                <div>
                  <Label className="text-muted-foreground">Note stato</Label>
                  <p className="text-sm bg-muted p-2 rounded mt-1">{selectedRequest.status_notes}</p>
                </div>
              )}

              {actionType && (
                <div className="space-y-2">
                  <Label>Note (opzionali)</Label>
                  <Textarea
                    placeholder={actionType === "approve" 
                      ? "Note per l'approvazione (es: commissioni concordate)..."
                      : "Motivo del rifiuto..."
                    }
                    value={statusNotes}
                    onChange={(e) => setStatusNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRequest(null)} disabled={processing}>
              {actionType ? "Annulla" : "Chiudi"}
            </Button>
            {actionType === "approve" && (
              <Button className="bg-green-600 hover:bg-green-700" onClick={handleAction} disabled={processing}>
                {processing ? "Approvazione..." : "Conferma Approvazione"}
              </Button>
            )}
            {actionType === "reject" && (
              <Button variant="destructive" onClick={handleAction} disabled={processing}>
                {processing ? "Rifiuto..." : "Conferma Rifiuto"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
