"use client"

import { useState, useEffect, use } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  MapPin,
  Calendar,
  Star,
  TrendingUp,
  Eye,
  MousePointer,
  Edit,
  MessageSquare,
  Send,
  Clock,
  Hotel,
  CreditCard,
  Heart,
  Gift,
} from "lucide-react"
import Link from "next/link"

interface ContactDetail {
  id: string
  name: string
  email: string
  phone?: string
  company?: string
  country?: string
  city?: string
  birthday?: string
  anniversary?: string
  source: string
  vip_level: string
  lead_score: number
  total_bookings: number
  total_revenue_cents: number
  first_booking_date?: string
  last_booking_date?: string
  avg_stay_nights: number
  preferred_room_type?: string
  preferred_season?: string
  interests?: string[]
  special_requests?: string
  marketing_consent: boolean
  gdpr_consent: boolean
  consent_date?: string
  unsubscribed: boolean
  email_opens_count: number
  email_clicks_count: number
  last_email_open_at?: string
  last_email_click_at?: string
  created_at: string
  updated_at: string
}

interface Stay {
  id: string
  check_in: string
  check_out: string
  room_type: string
  room_number?: string
  adults: number
  children: number
  rate_cents: number
  booking_source: string
  status: string
}

interface Activity {
  type: string
  description: string
  timestamp: string
}

export default function ContactDetailPage({ params }: { params: Promise<{ contactId: string }> }) {
  const resolvedParams = use(params)
  const [contact, setContact] = useState<ContactDetail | null>(null)
  const [stays, setStays] = useState<Stay[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchContactData()
  }, [resolvedParams.contactId])

  const fetchContactData = async () => {
    try {
      const [contactRes, staysRes] = await Promise.all([
        fetch(`/api/admin/crm/contacts/${resolvedParams.contactId}`),
        fetch(`/api/admin/crm/contacts/${resolvedParams.contactId}/stays`),
      ])

      if (contactRes.ok) setContact(await contactRes.json())
      if (staysRes.ok) setStays(await staysRes.json())
    } catch (error) {
      console.error("Error fetching contact:", error)
    } finally {
      setLoading(false)
    }
  }

  const getVipColor = (level: string) => {
    switch (level) {
      case "platinum":
        return "bg-purple-100 text-purple-800 border-purple-300"
      case "gold":
        return "bg-yellow-100 text-yellow-800 border-yellow-300"
      case "silver":
        return "bg-gray-200 text-gray-800 border-gray-400"
      default:
        return "bg-gray-100 text-gray-600"
    }
  }

  if (loading) {
    return <div className="p-8 text-center">Caricamento...</div>
  }

  if (!contact) {
    return <div className="p-8 text-center">Contatto non trovato</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/crm">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{contact.name || "N/A"}</h1>
              <Badge className={getVipColor(contact.vip_level)}>
                <Star className="h-3 w-3 mr-1" />
                {contact.vip_level.toUpperCase()}
              </Badge>
            </div>
            <p className="text-muted-foreground">{contact.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <MessageSquare className="h-4 w-4 mr-2" />
            Conversazioni
          </Button>
          <Button variant="outline">
            <Send className="h-4 w-4 mr-2" />
            Invia Email
          </Button>
          <Button>
            <Edit className="h-4 w-4 mr-2" />
            Modifica
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <Hotel className="h-5 w-5 mx-auto mb-1 text-blue-600" />
            <p className="text-2xl font-bold">{contact.total_bookings}</p>
            <p className="text-xs text-muted-foreground">Prenotazioni</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <CreditCard className="h-5 w-5 mx-auto mb-1 text-green-600" />
            <p className="text-2xl font-bold">€{(contact.total_revenue_cents / 100).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Revenue Totale</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Clock className="h-5 w-5 mx-auto mb-1 text-purple-600" />
            <p className="text-2xl font-bold">{contact.avg_stay_nights}</p>
            <p className="text-xs text-muted-foreground">Notti Media</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto mb-1 text-orange-600" />
            <p className="text-2xl font-bold">{contact.lead_score}</p>
            <p className="text-xs text-muted-foreground">Lead Score</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Eye className="h-5 w-5 mx-auto mb-1 text-blue-600" />
            <p className="text-2xl font-bold">{contact.email_opens_count}</p>
            <p className="text-xs text-muted-foreground">Email Aperte</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <MousePointer className="h-5 w-5 mx-auto mb-1 text-green-600" />
            <p className="text-2xl font-bold">{contact.email_clicks_count}</p>
            <p className="text-xs text-muted-foreground">Click</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informazioni</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {contact.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{contact.phone}</span>
                </div>
              )}
              {contact.company && (
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{contact.company}</span>
                </div>
              )}
              {(contact.city || contact.country) && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{[contact.city, contact.country].filter(Boolean).join(", ")}</span>
                </div>
              )}
              {contact.birthday && (
                <div className="flex items-center gap-3">
                  <Gift className="h-4 w-4 text-muted-foreground" />
                  <span>Compleanno: {new Date(contact.birthday).toLocaleDateString("it-IT")}</span>
                </div>
              )}
              {contact.anniversary && (
                <div className="flex items-center gap-3">
                  <Heart className="h-4 w-4 text-muted-foreground" />
                  <span>Anniversario: {new Date(contact.anniversary).toLocaleDateString("it-IT")}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Preferenze</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {contact.preferred_room_type && (
                <div>
                  <p className="text-sm text-muted-foreground">Camera Preferita</p>
                  <p className="font-medium">{contact.preferred_room_type}</p>
                </div>
              )}
              {contact.preferred_season && (
                <div>
                  <p className="text-sm text-muted-foreground">Stagione Preferita</p>
                  <p className="font-medium capitalize">{contact.preferred_season}</p>
                </div>
              )}
              {contact.interests && contact.interests.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Interessi</p>
                  <div className="flex flex-wrap gap-1">
                    {contact.interests.map((i) => (
                      <Badge key={i} variant="secondary">
                        {i}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {contact.special_requests && (
                <div>
                  <p className="text-sm text-muted-foreground">Richieste Speciali</p>
                  <p className="text-sm">{contact.special_requests}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Consensi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm">GDPR</span>
                <Badge variant={contact.gdpr_consent ? "default" : "secondary"}>
                  {contact.gdpr_consent ? "Accettato" : "Non dato"}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Marketing</span>
                <Badge variant={contact.marketing_consent && !contact.unsubscribed ? "default" : "secondary"}>
                  {contact.unsubscribed ? "Disiscritto" : contact.marketing_consent ? "Accettato" : "Non dato"}
                </Badge>
              </div>
              {contact.consent_date && (
                <p className="text-xs text-muted-foreground">
                  Data consenso: {new Date(contact.consent_date).toLocaleDateString("it-IT")}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Stays & Activity */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="stays">
            <TabsList>
              <TabsTrigger value="stays">Soggiorni ({stays.length})</TabsTrigger>
              <TabsTrigger value="emails">Email Marketing</TabsTrigger>
              <TabsTrigger value="activity">Attività</TabsTrigger>
            </TabsList>

            <TabsContent value="stays" className="space-y-4">
              {stays.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Nessun soggiorno registrato
                  </CardContent>
                </Card>
              ) : (
                stays.map((stay) => (
                  <Card key={stay.id}>
                    <CardContent className="pt-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              {new Date(stay.check_in).toLocaleDateString("it-IT")} -{" "}
                              {new Date(stay.check_out).toLocaleDateString("it-IT")}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {stay.room_type} {stay.room_number && `• Camera ${stay.room_number}`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {stay.adults} adulti {stay.children > 0 && `+ ${stay.children} bambini`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">€{(stay.rate_cents / 100).toLocaleString()}</p>
                          <Badge variant="outline">{stay.booking_source}</Badge>
                          <Badge
                            className={
                              stay.status === "checked_out"
                                ? "bg-green-100 text-green-800 ml-2"
                                : stay.status === "confirmed"
                                  ? "bg-blue-100 text-blue-800 ml-2"
                                  : stay.status === "cancelled"
                                    ? "bg-red-100 text-red-800 ml-2"
                                    : "ml-2"
                            }
                          >
                            {stay.status}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="emails">
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Mail className="h-10 w-10 mx-auto mb-4 opacity-50" />
                  <p>Nessuna campagna email inviata a questo contatto</p>
                  <Button variant="outline" className="mt-4 bg-transparent">
                    <Send className="h-4 w-4 mr-2" />
                    Invia Prima Email
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity">
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Clock className="h-10 w-10 mx-auto mb-4 opacity-50" />
                  <p>Nessuna attività recente</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
