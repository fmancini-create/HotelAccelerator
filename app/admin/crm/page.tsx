"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Users,
  Search,
  Download,
  Upload,
  Plus,
  Star,
  Mail,
  Calendar,
  TrendingUp,
  Eye,
  MousePointer,
  UserCheck,
  Building2,
  MoreHorizontal,
  Sparkles,
  Tag,
  Globe,
  Heart,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import Link from "next/link"

interface Contact {
  id: string
  name: string
  email: string
  phone?: string
  company?: string
  country?: string
  city?: string
  source: string
  vip_level: string
  lead_score: number
  total_bookings: number
  total_revenue_cents: number
  last_booking_date?: string
  marketing_consent: boolean
  unsubscribed: boolean
  interests?: string[]
  email_opens_count: number
  email_clicks_count: number
  created_at: string
}

interface Segment {
  id: string
  name: string
  description?: string
  segment_type: string
  contact_count: number
  last_computed_at?: string
}

interface CRMStats {
  total_contacts: number
  with_consent: number
  vip_contacts: number
  avg_lead_score: number
  total_bookings: number
  total_revenue: number
}

export default function CRMPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [stats, setStats] = useState<CRMStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSegment, setSelectedSegment] = useState<string>("all")
  const [selectedVip, setSelectedVip] = useState<string>("all")
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showContactDialog, setShowContactDialog] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)

  useEffect(() => {
    fetchData()
  }, [selectedSegment, selectedVip])

  const fetchData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedSegment !== "all") params.set("segment", selectedSegment)
      if (selectedVip !== "all") params.set("vip", selectedVip)

      const [contactsRes, segmentsRes, statsRes] = await Promise.all([
        fetch(`/api/admin/crm/contacts?${params}`),
        fetch("/api/admin/crm/segments"),
        fetch("/api/admin/crm/stats"),
      ])

      if (contactsRes.ok) setContacts(await contactsRes.json())
      if (segmentsRes.ok) setSegments(await segmentsRes.json())
      if (statsRes.ok) setStats(await statsRes.json())
    } catch (error) {
      console.error("Error fetching CRM data:", error)
    } finally {
      setLoading(false)
    }
  }

  const filteredContacts = contacts.filter(
    (c) =>
      c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.company?.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const handleExport = async () => {
    try {
      const res = await fetch("/api/admin/crm/contacts/export", { method: "POST" })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `contacts-${new Date().toISOString().split("T")[0]}.csv`
        a.click()
      }
    } catch (error) {
      console.error("Export error:", error)
    }
  }

  const getVipBadge = (level: string) => {
    const colors: Record<string, string> = {
      platinum: "bg-purple-100 text-purple-800",
      gold: "bg-yellow-100 text-yellow-800",
      silver: "bg-gray-200 text-gray-800",
      standard: "bg-gray-100 text-gray-600",
    }
    return colors[level] || colors.standard
  }

  const getSourceIcon = (source: string) => {
    switch (source) {
      case "pms":
        return <Building2 className="h-3 w-3" />
      case "email":
        return <Mail className="h-3 w-3" />
      case "website":
        return <Globe className="h-3 w-3" />
      default:
        return <Users className="h-3 w-3" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM & Contatti</h1>
          <p className="text-muted-foreground">Database intelligente per marketing targettizzato</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImportDialog(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Importa
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Esporta
          </Button>
          <Button
            onClick={() => {
              setEditingContact(null)
              setShowContactDialog(true)
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Contatto
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Totale</span>
              </div>
              <p className="text-2xl font-bold">{stats.total_contacts.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-green-600" />
                <span className="text-sm text-muted-foreground">Con Consenso</span>
              </div>
              <p className="text-2xl font-bold">{stats.with_consent.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500" />
                <span className="text-sm text-muted-foreground">VIP</span>
              </div>
              <p className="text-2xl font-bold">{stats.vip_contacts}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-600" />
                <span className="text-sm text-muted-foreground">Lead Score Medio</span>
              </div>
              <p className="text-2xl font-bold">{stats.avg_lead_score}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-muted-foreground">Prenotazioni</span>
              </div>
              <p className="text-2xl font-bold">{stats.total_bookings.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span className="text-sm text-muted-foreground">Revenue</span>
              </div>
              <p className="text-2xl font-bold">€{(stats.total_revenue / 100).toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Tabs defaultValue="contacts">
        <TabsList>
          <TabsTrigger value="contacts">Contatti</TabsTrigger>
          <TabsTrigger value="segments">Segmenti</TabsTrigger>
          <TabsTrigger value="imports">Import/Export</TabsTrigger>
        </TabsList>

        <TabsContent value="contacts" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cerca per nome, email o azienda..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={selectedSegment} onValueChange={setSelectedSegment}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Segmento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti i segmenti</SelectItem>
                    {segments.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.contact_count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedVip} onValueChange={setSelectedVip}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="VIP Level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti</SelectItem>
                    <SelectItem value="platinum">Platinum</SelectItem>
                    <SelectItem value="gold">Gold</SelectItem>
                    <SelectItem value="silver">Silver</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Contacts Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="p-3 text-left w-10">
                        <Checkbox
                          checked={selectedContacts.length === filteredContacts.length && filteredContacts.length > 0}
                          onCheckedChange={(checked) => {
                            setSelectedContacts(checked ? filteredContacts.map((c) => c.id) : [])
                          }}
                        />
                      </th>
                      <th className="p-3 text-left text-sm font-medium">Contatto</th>
                      <th className="p-3 text-left text-sm font-medium">Fonte</th>
                      <th className="p-3 text-left text-sm font-medium">VIP</th>
                      <th className="p-3 text-left text-sm font-medium">Score</th>
                      <th className="p-3 text-left text-sm font-medium">Prenotazioni</th>
                      <th className="p-3 text-left text-sm font-medium">Revenue</th>
                      <th className="p-3 text-left text-sm font-medium">Email Stats</th>
                      <th className="p-3 text-left text-sm font-medium">Consenso</th>
                      <th className="p-3 text-left text-sm font-medium w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-muted-foreground">
                          Caricamento...
                        </td>
                      </tr>
                    ) : filteredContacts.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-muted-foreground">
                          Nessun contatto trovato
                        </td>
                      </tr>
                    ) : (
                      filteredContacts.map((contact) => (
                        <tr key={contact.id} className="border-b hover:bg-muted/30">
                          <td className="p-3">
                            <Checkbox
                              checked={selectedContacts.includes(contact.id)}
                              onCheckedChange={(checked) => {
                                setSelectedContacts((prev) =>
                                  checked ? [...prev, contact.id] : prev.filter((id) => id !== contact.id),
                                )
                              }}
                            />
                          </td>
                          <td className="p-3">
                            <Link href={`/admin/crm/contacts/${contact.id}`} className="hover:underline">
                              <div className="font-medium">{contact.name || "N/A"}</div>
                              <div className="text-sm text-muted-foreground">{contact.email}</div>
                              {contact.company && (
                                <div className="text-xs text-muted-foreground">{contact.company}</div>
                              )}
                            </Link>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className="flex items-center gap-1 w-fit">
                              {getSourceIcon(contact.source)}
                              {contact.source}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <Badge className={getVipBadge(contact.vip_level)}>{contact.vip_level}</Badge>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="w-12 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-purple-600 rounded-full"
                                  style={{ width: `${Math.min(contact.lead_score, 100)}%` }}
                                />
                              </div>
                              <span className="text-sm">{contact.lead_score}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="text-sm">{contact.total_bookings}</div>
                            {contact.last_booking_date && (
                              <div className="text-xs text-muted-foreground">
                                Ultimo: {new Date(contact.last_booking_date).toLocaleDateString("it-IT")}
                              </div>
                            )}
                          </td>
                          <td className="p-3 font-medium">€{(contact.total_revenue_cents / 100).toLocaleString()}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Eye className="h-3 w-3" /> {contact.email_opens_count}
                              </span>
                              <span className="flex items-center gap-1">
                                <MousePointer className="h-3 w-3" /> {contact.email_clicks_count}
                              </span>
                            </div>
                          </td>
                          <td className="p-3">
                            {contact.unsubscribed ? (
                              <Badge variant="destructive">Disiscritto</Badge>
                            ) : contact.marketing_consent ? (
                              <Badge className="bg-green-100 text-green-800">OK</Badge>
                            ) : (
                              <Badge variant="secondary">No</Badge>
                            )}
                          </td>
                          <td className="p-3">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link href={`/admin/crm/contacts/${contact.id}`}>Visualizza Dettagli</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setEditingContact(contact)
                                    setShowContactDialog(true)
                                  }}
                                >
                                  Modifica
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>Aggiungi a Segmento</DropdownMenuItem>
                                <DropdownMenuItem>Invia Email</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Bulk Actions */}
          {selectedContacts.length > 0 && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    <strong>{selectedContacts.length}</strong> contatti selezionati
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Tag className="h-4 w-4 mr-2" />
                      Aggiungi a Segmento
                    </Button>
                    <Button variant="outline" size="sm">
                      <Mail className="h-4 w-4 mr-2" />
                      Invia Campagna
                    </Button>
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Esporta Selezione
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="segments" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-muted-foreground">Crea segmenti dinamici per campagne mirate</p>
            <Button asChild>
              <Link href="/admin/crm/segments/new">
                <Plus className="h-4 w-4 mr-2" />
                Nuovo Segmento
              </Link>
            </Button>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Pre-built Segments */}
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-500" />
                  VIP Guests
                </CardTitle>
                <CardDescription>Ospiti Gold e Platinum</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-bold">{stats?.vip_contacts || 0}</span>
                  <Badge>Dinamico</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Heart className="h-5 w-5 text-red-500" />
                  Returning Guests
                </CardTitle>
                <CardDescription>2+ prenotazioni</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-bold">-</span>
                  <Badge>Dinamico</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-500" />
                  Birthday This Month
                </CardTitle>
                <CardDescription>Compleanni questo mese</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-bold">-</span>
                  <Badge>Dinamico</Badge>
                </div>
              </CardContent>
            </Card>

            {segments.map((segment) => (
              <Card key={segment.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{segment.name}</CardTitle>
                  <CardDescription>{segment.description || "Nessuna descrizione"}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center">
                    <span className="text-2xl font-bold">{segment.contact_count}</span>
                    <Badge variant={segment.segment_type === "dynamic" ? "default" : "secondary"}>
                      {segment.segment_type === "dynamic" ? "Dinamico" : "Statico"}
                    </Badge>
                  </div>
                  {segment.last_computed_at && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Aggiornato: {new Date(segment.last_computed_at).toLocaleString("it-IT")}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="imports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Importa Contatti</CardTitle>
              <CardDescription>Carica file CSV/Excel o sincronizza con sistemi esterni</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <Card className="cursor-pointer hover:border-primary" onClick={() => setShowImportDialog(true)}>
                  <CardContent className="pt-6 text-center">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <h3 className="font-medium">Carica File</h3>
                    <p className="text-sm text-muted-foreground">CSV, Excel</p>
                  </CardContent>
                </Card>
                <Card className="cursor-pointer hover:border-primary">
                  <CardContent className="pt-6 text-center">
                    <Building2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <h3 className="font-medium">Sincronizza PMS</h3>
                    <p className="text-sm text-muted-foreground">Protel, Opera, Mews...</p>
                  </CardContent>
                </Card>
                <Card className="cursor-pointer hover:border-primary">
                  <CardContent className="pt-6 text-center">
                    <Mail className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <h3 className="font-medium">Da Mailchimp</h3>
                    <p className="text-sm text-muted-foreground">Importa liste esistenti</p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Storico Import</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-center py-8">Nessun import effettuato</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importa Contatti</DialogTitle>
            <DialogDescription>Carica un file CSV o Excel con i tuoi contatti</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
              <p className="font-medium">Trascina il file qui</p>
              <p className="text-sm text-muted-foreground">oppure clicca per selezionare</p>
              <Input type="file" className="mt-4" accept=".csv,.xlsx,.xls" />
            </div>
            <div className="space-y-2">
              <Label>Opzioni</Label>
              <div className="flex items-center gap-2">
                <Checkbox id="update" />
                <Label htmlFor="update" className="font-normal">
                  Aggiorna contatti esistenti
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="consent" defaultChecked />
                <Label htmlFor="consent" className="font-normal">
                  Richiedi conferma consenso GDPR
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Annulla
            </Button>
            <Button>Avvia Import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contact Dialog */}
      <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingContact ? "Modifica Contatto" : "Nuovo Contatto"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input defaultValue={editingContact?.name} />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" defaultValue={editingContact?.email} />
            </div>
            <div className="space-y-2">
              <Label>Telefono</Label>
              <Input defaultValue={editingContact?.phone} />
            </div>
            <div className="space-y-2">
              <Label>Azienda</Label>
              <Input defaultValue={editingContact?.company} />
            </div>
            <div className="space-y-2">
              <Label>Paese</Label>
              <Input defaultValue={editingContact?.country} />
            </div>
            <div className="space-y-2">
              <Label>Città</Label>
              <Input defaultValue={editingContact?.city} />
            </div>
            <div className="space-y-2">
              <Label>VIP Level</Label>
              <Select defaultValue={editingContact?.vip_level || "standard"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="silver">Silver</SelectItem>
                  <SelectItem value="gold">Gold</SelectItem>
                  <SelectItem value="platinum">Platinum</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Interessi</Label>
              <Input placeholder="spa, wine, golf..." defaultValue={editingContact?.interests?.join(", ")} />
            </div>
            <div className="col-span-2 space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox id="marketing" defaultChecked={editingContact?.marketing_consent} />
                <Label htmlFor="marketing" className="font-normal">
                  Consenso Marketing
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowContactDialog(false)}>
              Annulla
            </Button>
            <Button>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
