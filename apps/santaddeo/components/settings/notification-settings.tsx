"use client"

import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Bell,
  Mail,
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  Loader2,
  AlertTriangle,
  TrendingDown,
  BedDouble,
  Clock,
  CalendarPlus,
  CalendarX2,
  Star,
} from "lucide-react"

interface NotificationPreferences {
  pricing_changes_email: boolean
  pricing_changes_popup: boolean
  pms_push_email: boolean
  pms_push_popup: boolean
  pricing_errors_email: boolean
  pricing_errors_popup: boolean
  booking_alerts_email: boolean
  booking_alerts_popup: boolean
  // Eventi PMS / OTA - opt-in
  new_bookings_email: boolean
  new_bookings_popup: boolean
  cancellations_email: boolean
  cancellations_popup: boolean
  new_reviews_email: boolean
  new_reviews_popup: boolean
  pace_alerts_email: boolean
  pace_alerts_popup: boolean
}

interface CustomAlertRule {
  id: string
  name: string
  is_active: boolean
  condition_type: "rooms_remaining" | "rooms_remaining_by_type"
  condition_operator: "lte" | "gte" | "eq"
  condition_value: number
  room_type_id: string | null
  room_type?: { id: string; name: string } | null
  days_ahead: number
  notify_email: boolean
  notify_popup: boolean
  cooldown_hours: number
  last_triggered_at: string | null
}

interface RoomType {
  id: string
  name: string
}

interface NotificationSettingsProps {
  hotelId: string
  roomTypes?: RoomType[]
}

const defaultPreferences: NotificationPreferences = {
  pricing_changes_email: false,
  pricing_changes_popup: true,
  pms_push_email: false,
  pms_push_popup: true,
  pricing_errors_email: true,
  pricing_errors_popup: true,
  booking_alerts_email: false,
  booking_alerts_popup: true,
  // Categorie opt-in: default OFF su entrambi i canali
  new_bookings_email: false,
  new_bookings_popup: false,
  cancellations_email: false,
  cancellations_popup: false,
  new_reviews_email: false,
  new_reviews_popup: false,
  pace_alerts_email: false,
  pace_alerts_popup: false,
}

const CONDITION_TYPE_LABELS: Record<string, string> = {
  rooms_remaining: "Camere rimanenti (totale)",
  rooms_remaining_by_type: "Camere rimanenti (per tipologia)",
}

const CONDITION_OPERATOR_LABELS: Record<string, string> = {
  lte: "minore o uguale a",
  gte: "maggiore o uguale a",
  eq: "uguale a",
}

export function NotificationSettings({ hotelId, roomTypes = [] }: NotificationSettingsProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences)
  const [rules, setRules] = useState<CustomAlertRule[]>([])
  const [activeCount, setActiveCount] = useState(0)
  const [editingRule, setEditingRule] = useState<CustomAlertRule | null>(null)
  const [showRuleDialog, setShowRuleDialog] = useState(false)
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)
  const [ruleSaving, setRuleSaving] = useState(false)

  // Form state per nuova regola
  const [ruleForm, setRuleForm] = useState({
    name: "",
    condition_type: "rooms_remaining" as "rooms_remaining" | "rooms_remaining_by_type",
    condition_operator: "lte" as "lte" | "gte" | "eq",
    condition_value: 2,
    room_type_id: "",
    days_ahead: 7,
    notify_email: true,
    notify_popup: true,
    cooldown_hours: 24,
    is_active: true,
  })

  // Carica preferenze e regole
  const loadData = useCallback(async () => {
    try {
      const [prefsRes, rulesRes] = await Promise.all([
        fetch(`/api/notification-preferences?hotelId=${hotelId}`),
        fetch(`/api/custom-alert-rules?hotelId=${hotelId}`),
      ])

      if (prefsRes.ok) {
        const { preferences: prefs } = await prefsRes.json()
        if (prefs) {
          setPreferences({
            pricing_changes_email: prefs.pricing_changes_email ?? false,
            pricing_changes_popup: prefs.pricing_changes_popup ?? true,
            pms_push_email: prefs.pms_push_email ?? false,
            pms_push_popup: prefs.pms_push_popup ?? true,
            pricing_errors_email: prefs.pricing_errors_email ?? true,
            pricing_errors_popup: prefs.pricing_errors_popup ?? true,
            booking_alerts_email: prefs.booking_alerts_email ?? false,
            booking_alerts_popup: prefs.booking_alerts_popup ?? true,
            new_bookings_email: prefs.new_bookings_email ?? false,
            new_bookings_popup: prefs.new_bookings_popup ?? false,
            cancellations_email: prefs.cancellations_email ?? false,
            cancellations_popup: prefs.cancellations_popup ?? false,
      new_reviews_email: prefs.new_reviews_email ?? false,
      new_reviews_popup: prefs.new_reviews_popup ?? false,
      pace_alerts_email: prefs.pace_alerts_email ?? false,
      pace_alerts_popup: prefs.pace_alerts_popup ?? false,
          })
        }
      }

      if (rulesRes.ok) {
        const { rules: r, activeCount: ac } = await rulesRes.json()
        setRules(r || [])
        setActiveCount(ac || 0)
      }
    } catch (error) {
      console.error("Error loading notification data:", error)
      toast.error("Errore nel caricamento delle impostazioni notifiche")
    } finally {
      setLoading(false)
    }
  }, [hotelId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Salva preferenze
  const savePreferences = async (newPrefs: Partial<NotificationPreferences>) => {
    setSaving(true)
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, ...preferences, ...newPrefs }),
      })

      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error)
      }

      setPreferences((prev) => ({ ...prev, ...newPrefs }))
      toast.success("Preferenze salvate")
    } catch (error) {
      console.error("Error saving preferences:", error)
      toast.error("Errore nel salvataggio delle preferenze")
    } finally {
      setSaving(false)
    }
  }

  // Toggle singola preferenza
  const togglePreference = (key: keyof NotificationPreferences) => {
    savePreferences({ [key]: !preferences[key] })
  }

  // Crea/Modifica regola
  const saveRule = async () => {
    setRuleSaving(true)
    try {
      const isEdit = !!editingRule
      const url = isEdit
        ? `/api/custom-alert-rules/${editingRule.id}`
        : "/api/custom-alert-rules"
      const method = isEdit ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelId,
          ...ruleForm,
          room_type_id: ruleForm.condition_type === "rooms_remaining_by_type" ? ruleForm.room_type_id : null,
        }),
      })

      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error)
      }

      toast.success(isEdit ? "Regola aggiornata" : "Regola creata")
      setShowRuleDialog(false)
      setEditingRule(null)
      resetRuleForm()
      loadData()
    } catch (error: any) {
      console.error("Error saving rule:", error)
      toast.error(error.message || "Errore nel salvataggio della regola")
    } finally {
      setRuleSaving(false)
    }
  }

  // Elimina regola
  const deleteRule = async (ruleId: string) => {
    try {
      const res = await fetch(`/api/custom-alert-rules/${ruleId}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error)
      }

      toast.success("Regola eliminata")
      setDeletingRuleId(null)
      loadData()
    } catch (error: any) {
      console.error("Error deleting rule:", error)
      toast.error(error.message || "Errore nell'eliminazione della regola")
    }
  }

  // Toggle attivo/disattivo regola
  const toggleRuleActive = async (rule: CustomAlertRule) => {
    try {
      const res = await fetch(`/api/custom-alert-rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !rule.is_active }),
      })

      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error)
      }

      toast.success(rule.is_active ? "Regola disattivata" : "Regola attivata")
      loadData()
    } catch (error: any) {
      console.error("Error toggling rule:", error)
      toast.error(error.message || "Errore nell'aggiornamento della regola")
    }
  }

  const resetRuleForm = () => {
    setRuleForm({
      name: "",
      condition_type: "rooms_remaining",
      condition_operator: "lte",
      condition_value: 2,
      room_type_id: "",
      days_ahead: 7,
      notify_email: true,
      notify_popup: true,
      cooldown_hours: 24,
      is_active: true,
    })
  }

  const openEditDialog = (rule: CustomAlertRule) => {
    setEditingRule(rule)
    setRuleForm({
      name: rule.name,
      condition_type: rule.condition_type,
      condition_operator: rule.condition_operator,
      condition_value: rule.condition_value,
      room_type_id: rule.room_type_id || "",
      days_ahead: rule.days_ahead,
      notify_email: rule.notify_email,
      notify_popup: rule.notify_popup,
      cooldown_hours: rule.cooldown_hours,
      is_active: rule.is_active,
    })
    setShowRuleDialog(true)
  }

  const openNewDialog = () => {
    setEditingRule(null)
    resetRuleForm()
    setShowRuleDialog(true)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Notifiche Standard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifiche Standard
          </CardTitle>
          <CardDescription>
            Configura come vuoi ricevere le notifiche per gli eventi principali
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Pricing Changes */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
              <Label className="text-base font-medium">Variazioni Prezzi</Label>
            </div>
            <p className="text-sm text-muted-foreground ml-6">
              Ricevi notifiche quando i prezzi vengono modificati dall&apos;algoritmo o manualmente
            </p>
            <div className="flex items-center gap-6 ml-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="pricing_changes_email"
                  checked={preferences.pricing_changes_email}
                  onCheckedChange={() => togglePreference("pricing_changes_email")}
                  disabled={saving}
                />
                <Label htmlFor="pricing_changes_email" className="flex items-center gap-1 text-sm">
                  <Mail className="h-4 w-4" /> Email
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="pricing_changes_popup"
                  checked={preferences.pricing_changes_popup}
                  onCheckedChange={() => togglePreference("pricing_changes_popup")}
                  disabled={saving}
                />
                <Label htmlFor="pricing_changes_popup" className="flex items-center gap-1 text-sm">
                  <MessageSquare className="h-4 w-4" /> In-app
                </Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* PMS Push */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <BedDouble className="h-4 w-4 text-muted-foreground" />
              <Label className="text-base font-medium">Invio al PMS</Label>
            </div>
            <p className="text-sm text-muted-foreground ml-6">
              Ricevi notifiche quando i prezzi vengono inviati al PMS (manualmente o via autopilot)
            </p>
            <div className="flex items-center gap-6 ml-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="pms_push_email"
                  checked={preferences.pms_push_email}
                  onCheckedChange={() => togglePreference("pms_push_email")}
                  disabled={saving}
                />
                <Label htmlFor="pms_push_email" className="flex items-center gap-1 text-sm">
                  <Mail className="h-4 w-4" /> Email
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="pms_push_popup"
                  checked={preferences.pms_push_popup}
                  onCheckedChange={() => togglePreference("pms_push_popup")}
                  disabled={saving}
                />
                <Label htmlFor="pms_push_popup" className="flex items-center gap-1 text-sm">
                  <MessageSquare className="h-4 w-4" /> In-app
                </Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Pricing Errors */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <Label className="text-base font-medium">Errori Pricing</Label>
            </div>
            <p className="text-sm text-muted-foreground ml-6">
              Ricevi notifiche in caso di errori nel calcolo prezzi o invio al PMS
            </p>
            <div className="flex items-center gap-6 ml-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="pricing_errors_email"
                  checked={preferences.pricing_errors_email}
                  onCheckedChange={() => togglePreference("pricing_errors_email")}
                  disabled={saving}
                />
                <Label htmlFor="pricing_errors_email" className="flex items-center gap-1 text-sm">
                  <Mail className="h-4 w-4" /> Email
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="pricing_errors_popup"
                  checked={preferences.pricing_errors_popup}
                  onCheckedChange={() => togglePreference("pricing_errors_popup")}
                  disabled={saving}
                />
                <Label htmlFor="pricing_errors_popup" className="flex items-center gap-1 text-sm">
                  <MessageSquare className="h-4 w-4" /> In-app
                </Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Booking Alerts */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Label className="text-base font-medium">Alert Prenotazioni</Label>
            </div>
            <p className="text-sm text-muted-foreground ml-6">
              Ricevi notifiche quando si verificano le condizioni delle regole personalizzate
            </p>
            <div className="flex items-center gap-6 ml-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="booking_alerts_email"
                  checked={preferences.booking_alerts_email}
                  onCheckedChange={() => togglePreference("booking_alerts_email")}
                  disabled={saving}
                />
                <Label htmlFor="booking_alerts_email" className="flex items-center gap-1 text-sm">
                  <Mail className="h-4 w-4" /> Email
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="booking_alerts_popup"
                  checked={preferences.booking_alerts_popup}
                  onCheckedChange={() => togglePreference("booking_alerts_popup")}
                  disabled={saving}
                />
                <Label htmlFor="booking_alerts_popup" className="flex items-center gap-1 text-sm">
                  <MessageSquare className="h-4 w-4" /> In-app
                </Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Nuove Prenotazioni (opt-in) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CalendarPlus className="h-4 w-4 text-muted-foreground" />
              <Label className="text-base font-medium">Nuove Prenotazioni</Label>
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                Opzionale
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground ml-6">
              Ricevi una notifica ogni volta che entra una nuova prenotazione dal PMS
            </p>
            <div className="flex items-center gap-6 ml-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="new_bookings_email"
                  checked={preferences.new_bookings_email}
                  onCheckedChange={() => togglePreference("new_bookings_email")}
                  disabled={saving}
                />
                <Label htmlFor="new_bookings_email" className="flex items-center gap-1 text-sm">
                  <Mail className="h-4 w-4" /> Email
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="new_bookings_popup"
                  checked={preferences.new_bookings_popup}
                  onCheckedChange={() => togglePreference("new_bookings_popup")}
                  disabled={saving}
                />
                <Label htmlFor="new_bookings_popup" className="flex items-center gap-1 text-sm">
                  <MessageSquare className="h-4 w-4" /> In-app
                </Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Cancellazioni (opt-in) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CalendarX2 className="h-4 w-4 text-muted-foreground" />
              <Label className="text-base font-medium">Cancellazioni</Label>
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                Opzionale
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground ml-6">
              Ricevi una notifica ogni volta che una prenotazione viene cancellata sul PMS
            </p>
            <div className="flex items-center gap-6 ml-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="cancellations_email"
                  checked={preferences.cancellations_email}
                  onCheckedChange={() => togglePreference("cancellations_email")}
                  disabled={saving}
                />
                <Label htmlFor="cancellations_email" className="flex items-center gap-1 text-sm">
                  <Mail className="h-4 w-4" /> Email
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="cancellations_popup"
                  checked={preferences.cancellations_popup}
                  onCheckedChange={() => togglePreference("cancellations_popup")}
                  disabled={saving}
                />
                <Label htmlFor="cancellations_popup" className="flex items-center gap-1 text-sm">
                  <MessageSquare className="h-4 w-4" /> In-app
                </Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Nuove Recensioni (opt-in) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-muted-foreground" />
              <Label className="text-base font-medium">Nuove Recensioni</Label>
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                Opzionale
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground ml-6">
              Ricevi una notifica ogni volta che viene importata una nuova recensione (Google, Booking, TripAdvisor, Expedia, Airbnb, VRBO)
            </p>
            <div className="flex items-center gap-6 ml-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="new_reviews_email"
                  checked={preferences.new_reviews_email}
                  onCheckedChange={() => togglePreference("new_reviews_email")}
                  disabled={saving}
                />
                <Label htmlFor="new_reviews_email" className="flex items-center gap-1 text-sm">
                  <Mail className="h-4 w-4" /> Email
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="new_reviews_popup"
                  checked={preferences.new_reviews_popup}
                  onCheckedChange={() => togglePreference("new_reviews_popup")}
                  disabled={saving}
                />
                <Label htmlFor="new_reviews_popup" className="flex items-center gap-1 text-sm">
                  <MessageSquare className="h-4 w-4" /> In-app
                </Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Allarmi Pace & Anomalie (opt-in) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
              <Label className="text-base font-medium">Allarmi Pace &amp; Anomalie</Label>
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                Opzionale
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground ml-6">
              Ricevi un avviso quando l&apos;analizzatore rileva anomalie sui mesi futuri: pace ricavi sotto l&apos;anno
              scorso, inversione di tendenza, rischio spirale al ribasso (ADR in calo con occupazione bassa) o pickup in
              stallo. Riepilogo giornaliero.
            </p>
            <div className="flex items-center gap-6 ml-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="pace_alerts_email"
                  checked={preferences.pace_alerts_email}
                  onCheckedChange={() => togglePreference("pace_alerts_email")}
                  disabled={saving}
                />
                <Label htmlFor="pace_alerts_email" className="flex items-center gap-1 text-sm">
                  <Mail className="h-4 w-4" /> Email
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="pace_alerts_popup"
                  checked={preferences.pace_alerts_popup}
                  onCheckedChange={() => togglePreference("pace_alerts_popup")}
                  disabled={saving}
                />
                <Label htmlFor="pace_alerts_popup" className="flex items-center gap-1 text-sm">
                  <MessageSquare className="h-4 w-4" /> In-app
                </Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Regole Personalizzate */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Regole Alert Personalizzate
              </CardTitle>
              <CardDescription>
                Crea regole per ricevere notifiche quando si verificano specifiche condizioni di disponibilita
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {activeCount}/5 attive
              </Badge>
              <Button
                onClick={openNewDialog}
                disabled={activeCount >= 5}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                Nuova Regola
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nessuna regola personalizzata configurata</p>
              <p className="text-sm mt-1">
                Crea una regola per ricevere notifiche quando rimangono poche camere da vendere
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    rule.is_active ? "bg-background" : "bg-muted/50 opacity-60"
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{rule.name}</span>
                      {!rule.is_active && (
                        <Badge variant="secondary" className="text-xs">
                          Disattivata
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Quando {rule.condition_type === "rooms_remaining_by_type" && rule.room_type?.name
                        ? `le camere "${rule.room_type.name}"`
                        : "le camere totali"}{" "}
                      rimanenti sono {CONDITION_OPERATOR_LABELS[rule.condition_operator]}{" "}
                      <strong>{rule.condition_value}</strong> nei prossimi {rule.days_ahead} giorni
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {rule.notify_email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> Email
                        </span>
                      )}
                      {rule.notify_popup && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" /> In-app
                        </span>
                      )}
                      <span>Cooldown: {rule.cooldown_hours}h</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={() => toggleRuleActive(rule)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(rule)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <AlertDialog
                      open={deletingRuleId === rule.id}
                      onOpenChange={(open) => !open && setDeletingRuleId(null)}
                    >
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingRuleId(rule.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminare questa regola?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Questa azione non puo essere annullata. La regola &quot;{rule.name}&quot; verra eliminata permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteRule(rule.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Elimina
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Nuova/Modifica Regola */}
      <Dialog open={showRuleDialog} onOpenChange={setShowRuleDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? "Modifica Regola" : "Nuova Regola Alert"}
            </DialogTitle>
            <DialogDescription>
              Configura quando vuoi ricevere una notifica basata sulla disponibilita camere
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rule-name">Nome regola</Label>
              <Input
                id="rule-name"
                placeholder="Es: Ultime camere disponibili"
                value={ruleForm.name}
                onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Un nome identificativo per riconoscere questa regola
              </p>
            </div>

            <div className="space-y-2">
              <Label>Tipo condizione</Label>
              <Select
                value={ruleForm.condition_type}
                onValueChange={(v: "rooms_remaining" | "rooms_remaining_by_type") =>
                  setRuleForm({ ...ruleForm, condition_type: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rooms_remaining">Camere rimanenti (totale)</SelectItem>
                  <SelectItem value="rooms_remaining_by_type">Camere rimanenti (per tipologia)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Scegli se monitorare tutte le camere dell&apos;hotel o solo una tipologia specifica
              </p>
            </div>

            {ruleForm.condition_type === "rooms_remaining_by_type" && (
              <div className="space-y-2">
                <Label>Tipologia camera</Label>
                <Select
                  value={ruleForm.room_type_id}
                  onValueChange={(v) => setRuleForm({ ...ruleForm, room_type_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona tipologia" />
                  </SelectTrigger>
                  <SelectContent>
                    {roomTypes.map((rt) => (
                      <SelectItem key={rt.id} value={rt.id}>
                        {rt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Operatore</Label>
                <Select
                  value={ruleForm.condition_operator}
                  onValueChange={(v: "lte" | "gte" | "eq") =>
                    setRuleForm({ ...ruleForm, condition_operator: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lte">Minore o uguale</SelectItem>
                    <SelectItem value="gte">Maggiore o uguale</SelectItem>
                    <SelectItem value="eq">Uguale</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Come confrontare la disponibilita
                </p>
              </div>

              <div className="space-y-2">
                <Label>Valore (camere)</Label>
                <Input
                  type="number"
                  min={0}
                  value={ruleForm.condition_value}
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, condition_value: parseInt(e.target.value) || 0 })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Soglia di camere libere
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Giorni in avanti</Label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={ruleForm.days_ahead}
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, days_ahead: parseInt(e.target.value) || 7 })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Controlla da oggi fino a X giorni nel futuro
                </p>
              </div>

              <div className="space-y-2">
                <Label>Cooldown (ore)</Label>
                <Input
                  type="number"
                  min={1}
                  max={168}
                  value={ruleForm.cooldown_hours}
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, cooldown_hours: parseInt(e.target.value) || 24 })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Tempo minimo tra due notifiche
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Canali di notifica</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Dove ricevere l&apos;avviso quando la condizione si verifica
              </p>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    id="rule-email"
                    checked={ruleForm.notify_email}
                    onCheckedChange={(checked) =>
                      setRuleForm({ ...ruleForm, notify_email: checked })
                    }
                  />
                  <Label htmlFor="rule-email" className="flex items-center gap-1">
                    <Mail className="h-4 w-4" /> Email
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="rule-popup"
                    checked={ruleForm.notify_popup}
                    onCheckedChange={(checked) =>
                      setRuleForm({ ...ruleForm, notify_popup: checked })
                    }
                  />
                  <Label htmlFor="rule-popup" className="flex items-center gap-1">
                    <MessageSquare className="h-4 w-4" /> In-app
                  </Label>
                </div>
              </div>
            </div>

            {/* Riepilogo regola */}
            {ruleForm.name && (
              <div className="rounded-lg bg-muted/50 p-3 mt-4">
                <p className="text-sm font-medium mb-1">Riepilogo:</p>
                <p className="text-sm text-muted-foreground">
                  Riceverai una notifica quando{" "}
                  {ruleForm.condition_type === "rooms_remaining_by_type" && ruleForm.room_type_id
                    ? "le camere di quella tipologia"
                    : "le camere totali dell'hotel"}{" "}
                  sono{" "}
                  <strong>
                    {ruleForm.condition_operator === "lte" ? "minori o uguali a" : 
                     ruleForm.condition_operator === "gte" ? "maggiori o uguali a" : "uguali a"}{" "}
                    {ruleForm.condition_value}
                  </strong>{" "}
                  in almeno una data dei prossimi <strong>{ruleForm.days_ahead} giorni</strong>.
                  Dopo l&apos;invio, attesa di <strong>{ruleForm.cooldown_hours} ore</strong> prima della prossima notifica.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRuleDialog(false)
                setEditingRule(null)
                resetRuleForm()
              }}
            >
              Annulla
            </Button>
            <Button
              onClick={saveRule}
              disabled={ruleSaving || !ruleForm.name || (ruleForm.condition_type === "rooms_remaining_by_type" && !ruleForm.room_type_id)}
            >
              {ruleSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingRule ? "Salva Modifiche" : "Crea Regola"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
