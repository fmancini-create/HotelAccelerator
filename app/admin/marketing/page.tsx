"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Mail,
  Plus,
  Send,
  Calendar,
  Eye,
  MousePointer,
  Users,
  Clock,
  BarChart3,
  AlertCircle,
  CheckCircle,
  Pause,
  MoreHorizontal,
  Copy,
  Trash2,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Link from "next/link"

interface Campaign {
  id: string
  name: string
  subject: string
  status: string
  scheduled_at?: string
  sent_at?: string
  total_recipients: number
  sent_count: number
  delivered_count: number
  opened_count: number
  clicked_count: number
  bounced_count: number
  unsubscribed_count: number
  segment_name?: string
  created_at: string
}

interface MarketingStats {
  total_campaigns: number
  total_sent: number
  avg_open_rate: number
  avg_click_rate: number
  total_unsubscribes: number
}

export default function MarketingPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stats, setStats] = useState<MarketingStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("all")

  useEffect(() => {
    fetchData()
  }, [filter])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [campaignsRes, statsRes] = await Promise.all([
        fetch(`/api/admin/marketing/campaigns?status=${filter}`),
        fetch("/api/admin/marketing/stats"),
      ])

      if (campaignsRes.ok) setCampaigns(await campaignsRes.json())
      if (statsRes.ok) setStats(await statsRes.json())
    } catch (error) {
      console.error("Error fetching marketing data:", error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" /> Inviata
          </Badge>
        )
      case "scheduled":
        return (
          <Badge className="bg-blue-100 text-blue-800">
            <Clock className="h-3 w-3 mr-1" /> Programmata
          </Badge>
        )
      case "sending":
        return (
          <Badge className="bg-yellow-100 text-yellow-800">
            <Send className="h-3 w-3 mr-1" /> In Invio
          </Badge>
        )
      case "paused":
        return (
          <Badge className="bg-orange-100 text-orange-800">
            <Pause className="h-3 w-3 mr-1" /> In Pausa
          </Badge>
        )
      case "draft":
        return <Badge variant="secondary">Bozza</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const calculateRate = (count: number, total: number) => {
    if (total === 0) return "0%"
    return `${((count / total) * 100).toFixed(1)}%`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Email Marketing</h1>
          <p className="text-muted-foreground">Crea e gestisci campagne email</p>
        </div>
        <Button asChild>
          <Link href="/admin/marketing/campaigns/new">
            <Plus className="h-4 w-4 mr-2" />
            Nuova Campagna
          </Link>
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Campagne</span>
              </div>
              <p className="text-2xl font-bold">{stats.total_campaigns}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Email Inviate</span>
              </div>
              <p className="text-2xl font-bold">{stats.total_sent.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-green-600" />
                <span className="text-sm text-muted-foreground">Open Rate</span>
              </div>
              <p className="text-2xl font-bold">{stats.avg_open_rate.toFixed(1)}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <MousePointer className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-muted-foreground">Click Rate</span>
              </div>
              <p className="text-2xl font-bold">{stats.avg_click_rate.toFixed(1)}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm text-muted-foreground">Disiscrizioni</span>
              </div>
              <p className="text-2xl font-bold">{stats.total_unsubscribes}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Campaigns */}
      <Tabs defaultValue="all" onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">Tutte</TabsTrigger>
          <TabsTrigger value="draft">Bozze</TabsTrigger>
          <TabsTrigger value="scheduled">Programmate</TabsTrigger>
          <TabsTrigger value="sent">Inviate</TabsTrigger>
        </TabsList>

        <TabsContent value={filter} className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">Caricamento...</CardContent>
            </Card>
          ) : campaigns.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Mail className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="font-medium mb-2">Nessuna campagna</h3>
                <p className="text-muted-foreground mb-4">Crea la tua prima campagna email</p>
                <Button asChild>
                  <Link href="/admin/marketing/campaigns/new">
                    <Plus className="h-4 w-4 mr-2" />
                    Nuova Campagna
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {campaigns.map((campaign) => (
                <Card key={campaign.id} className="hover:border-primary/50 transition-colors">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <Link
                            href={`/admin/marketing/campaigns/${campaign.id}`}
                            className="font-medium hover:underline"
                          >
                            {campaign.name}
                          </Link>
                          {getStatusBadge(campaign.status)}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{campaign.subject}</p>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {campaign.segment_name && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" /> {campaign.segment_name}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" /> {campaign.total_recipients} destinatari
                          </span>
                          {campaign.scheduled_at && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(campaign.scheduled_at).toLocaleDateString("it-IT", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                        </div>
                      </div>

                      {campaign.status === "sent" && (
                        <div className="flex items-center gap-6 text-sm">
                          <div className="text-center">
                            <p className="font-bold text-green-600">
                              {calculateRate(campaign.opened_count, campaign.delivered_count)}
                            </p>
                            <p className="text-xs text-muted-foreground">Aperture</p>
                          </div>
                          <div className="text-center">
                            <p className="font-bold text-blue-600">
                              {calculateRate(campaign.clicked_count, campaign.delivered_count)}
                            </p>
                            <p className="text-xs text-muted-foreground">Click</p>
                          </div>
                          <div className="text-center">
                            <p className="font-bold text-red-600">
                              {calculateRate(campaign.bounced_count, campaign.sent_count)}
                            </p>
                            <p className="text-xs text-muted-foreground">Bounce</p>
                          </div>
                        </div>
                      )}

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="ml-4">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/marketing/campaigns/${campaign.id}`}>
                              <BarChart3 className="h-4 w-4 mr-2" /> Visualizza Report
                            </Link>
                          </DropdownMenuItem>
                          {campaign.status === "draft" && (
                            <DropdownMenuItem>
                              <Send className="h-4 w-4 mr-2" /> Invia Ora
                            </DropdownMenuItem>
                          )}
                          {campaign.status === "scheduled" && (
                            <DropdownMenuItem>
                              <Pause className="h-4 w-4 mr-2" /> Metti in Pausa
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem>
                            <Copy className="h-4 w-4 mr-2" /> Duplica
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" /> Elimina
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
