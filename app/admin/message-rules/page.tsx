"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, Megaphone, Plus, Eye, Pencil, Trash2, Home, MousePointer, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { useAdminAuth } from "@/lib/admin-hooks"
import { createBrowserClient } from "@/lib/supabase-browser"
import { DEFAULT_PROPERTY_ID } from "@/lib/tenant"

interface MessageRule {
  id: string
  name: string
  description: string | null
  rule_type: "page_visits" | "room_interest" | "return_visitor"
  conditions: Record<string, any>
  message_type: "popup" | "chat"
  message_content: {
    title?: string
    body?: string
    cta_text?: string
    cta_url?: string
    image_url?: string
  }
  is_active: boolean
  priority: number
  impressions_count: number
  clicks_count: number
  created_at: string
}

const RULE_TYPE_LABELS: Record<string, { label: string; description: string; icon: any }> = {
  page_visits: {
    label: "Visitatori frequenti",
    description: "Chi visita più volte una pagina",
    icon: Eye,
  },
  room_interest: {
    label: "Interesse camere",
    description: "Chi guarda più camere",
    icon: MousePointer,
  },
  return_visitor: {
    label: "Visitatori che tornano",
    description: "Chi ritorna sul sito dopo alcuni giorni",
    icon: RefreshCw,
  },
}

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  popup: "Popup",
  chat: "Messaggio in chat",
}

export default function MessageRulesPage() {
  const { isLoading: authLoading, adminUser } = useAdminAuth()
  const [rules, setRules] = useState<MessageRule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingRule, setEditingRule] = useState<MessageRule | null>(null)
  const [previewRule, setPreviewRule] = useState<MessageRule | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    rule_type: "page_visits" as "page_visits" | "room_interest" | "return_visitor",
    message_type: "popup" as "popup" | "chat",
    condition_value: 3,
    condition_min_days: 1,
    condition_max_days: 7,
    condition_page_pattern: "",
    title: "",
    body: "",
    cta_text: "",
    cta_url: "",
  })

  useEffect(() => {
    if (!authLoading && adminUser) {
      loadRules()
    }
  }, [authLoading, adminUser])

  const loadRules = async () => {
    try {
      const supabase = createBrowserClient()
      const { data, error } = await supabase
        .from("message_rules")
        .select("*")
        .eq("property_id", DEFAULT_PROPERTY_ID)
        .order("priority", { ascending: false })

      if (error) throw error
      setRules(data || [])
    } catch (err: any) {
      console.error("Error loading rules:", err)
      setError("Errore caricamento messaggi")
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleActive = async (rule: MessageRule) => {
    try {
      const supabase = createBrowserClient()
      const { error } = await supabase
        .from("message_rules")
        .update({ is_active: !rule.is_active, updated_at: new Date().toISOString() })
        .eq("id", rule.id)

      if (error) throw error

      setRules(rules.map((r) => (r.id === rule.id ? { ...r, is_active: !r.is_active } : r)))
      setSuccess(`Messaggio ${!rule.is_active ? "attivato" : "disattivato"}`)
      setTimeout(() => setSuccess(""), 3000)
    } catch (err: any) {
      setError("Errore aggiornamento messaggio")
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      rule_type: "page_visits",
      message_type: "popup",
      condition_value: 3,
      condition_min_days: 1,
      condition_max_days: 7,
      condition_page_pattern: "",
      title: "",
      body: "",
      cta_text: "",
      cta_url: "",
    })
    setEditingRule(null)
    setShowForm(false)
  }

  const handleEdit = (rule: MessageRule) => {
    setEditingRule(rule)

    let conditionValue = 3
    let conditionMinDays = 1
    let conditionMaxDays = 7
    let conditionPagePattern = ""

    if (rule.rule_type === "page_visits") {
      conditionValue = rule.conditions?.min || 3
      conditionPagePattern = rule.conditions?.page_pattern || ""
    } else if (rule.rule_type === "room_interest") {
      conditionValue = rule.conditions?.min_clicks || 3
    } else if (rule.rule_type === "return_visitor") {
      conditionMinDays = rule.conditions?.min_days || 1
      conditionMaxDays = rule.conditions?.max_days || 7
    }

    setFormData({
      name: rule.name,
      description: rule.description || "",
      rule_type: rule.rule_type,
      message_type: rule.message_type,
      condition_value: conditionValue,
      condition_min_days: conditionMinDays,
      condition_max_days: conditionMaxDays,
      condition_page_pattern: conditionPagePattern,
      title: rule.message_content.title || "",
      body: rule.message_content.body || "",
      cta_text: rule.message_content.cta_text || "",
      cta_url: rule.message_content.cta_url || "",
    })
    setShowForm(true)
  }

  const handleDelete = async (rule: MessageRule) => {
    if (!confirm(`Eliminare il messaggio "${rule.name}"?`)) return

    try {
      const supabase = createBrowserClient()
      const { error } = await supabase.from("message_rules").delete().eq("id", rule.id)

      if (error) throw error

      setRules(rules.filter((r) => r.id !== rule.id))
      setSuccess("Messaggio eliminato")
      setTimeout(() => setSuccess(""), 3000)
    } catch (err: any) {
      setError("Errore eliminazione messaggio")
    }
  }

  const handleSave = async () => {
    setError("")

    if (!formData.name.trim()) {
      setError("Il nome è obbligatorio")
      return
    }
    if (!formData.body.trim()) {
      setError("Il testo del messaggio è obbligatorio")
      return
    }

    setIsSaving(true)

    try {
      const supabase = createBrowserClient()

      let conditions: Record<string, any> = {}
      if (formData.rule_type === "page_visits") {
        conditions = { min: formData.condition_value }
        if (formData.condition_page_pattern) {
          conditions.page_pattern = formData.condition_page_pattern
        }
      } else if (formData.rule_type === "room_interest") {
        conditions = { min_clicks: formData.condition_value }
      } else if (formData.rule_type === "return_visitor") {
        conditions = {
          min_days: formData.condition_min_days,
          max_days: formData.condition_max_days,
        }
      }

      const ruleData = {
        property_id: DEFAULT_PROPERTY_ID,
        name: formData.name,
        description: formData.description || null,
        rule_type: formData.rule_type,
        conditions,
        message_type: formData.message_type,
        message_content: {
          title: formData.title || undefined,
          body: formData.body,
          cta_text: formData.cta_text || undefined,
          cta_url: formData.cta_url || undefined,
        },
        updated_at: new Date().toISOString(),
      }

      if (editingRule) {
        const { error } = await supabase.from("message_rules").update(ruleData).eq("id", editingRule.id)

        if (error) throw error
        setSuccess("Messaggio aggiornato")
      } else {
        const { error } = await supabase.from("message_rules").insert({
          ...ruleData,
          is_active: false,
          priority: 10,
          max_impressions_per_session: 1,
          max_impressions_per_day: 3,
        })

        if (error) throw error
        setSuccess("Messaggio creato")
      }

      resetForm()
      loadRules()
      setTimeout(() => setSuccess(""), 3000)
    } catch (err: any) {
      console.error("Save error:", err)
      setError("Errore salvataggio messaggio")
    } finally {
      setIsSaving(false)
    }
  }

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#8b7355]"></div>
      </div>
    )
  }

  if (!adminUser) return null

  return (
    <main className="min-h-screen bg-[#f8f7f4]">
      {/* Header */}
      <header className="bg-white border-b border-[#e5e5e5] sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/admin/dashboard">
                <Button variant="ghost" size="sm" className="text-[#8b7355]">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-[#8b7355]" />
                <h1 className="text-xl font-serif text-[#5c5c5c]">Smart Messages</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#8b7355] text-[#8b7355] hover:bg-[#8b7355] hover:text-white bg-transparent"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Sito
                </Button>
              </Link>
              {!showForm && (
                <Button onClick={() => setShowForm(true)} className="bg-[#8b7355] hover:bg-[#6b5a45]">
                  <Plus className="w-4 h-4 mr-2" />
                  Nuovo Messaggio
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Alerts */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {success}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-[#e5e5e5] p-6 mb-8">
            <h2 className="text-lg font-medium text-[#5c5c5c] mb-6">
              {editingRule ? "Modifica Messaggio" : "Nuovo Messaggio"}
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left - Settings */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#5c5c5c] mb-1">Nome *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Es: Promo Suite Estate"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#5c5c5c] mb-1">Note interne (opzionale)</label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Promemoria per te"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#5c5c5c] mb-2">A chi mostrare</label>
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(RULE_TYPE_LABELS).map(([key, { label, description, icon: Icon }]) => (
                      <label
                        key={key}
                        className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                          formData.rule_type === key
                            ? "border-[#8b7355] bg-[#8b7355]/5"
                            : "border-[#e5e5e5] hover:bg-[#f8f7f4]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="rule_type"
                          value={key}
                          checked={formData.rule_type === key}
                          onChange={() => setFormData({ ...formData, rule_type: key as any })}
                          className="sr-only"
                        />
                        <Icon
                          className={`w-5 h-5 ${formData.rule_type === key ? "text-[#8b7355]" : "text-[#8b8b8b]"}`}
                        />
                        <div>
                          <p className="font-medium text-sm text-[#5c5c5c]">{label}</p>
                          <p className="text-xs text-[#8b8b8b]">{description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Condition inputs based on rule type */}
                {formData.rule_type === "page_visits" && (
                  <div className="space-y-3 p-3 bg-[#f8f7f4] rounded-lg">
                    <div>
                      <label className="block text-sm text-[#5c5c5c] mb-1">Dopo quante visite?</label>
                      <Input
                        type="number"
                        min={1}
                        value={formData.condition_value}
                        onChange={(e) =>
                          setFormData({ ...formData, condition_value: Number.parseInt(e.target.value) || 1 })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-[#5c5c5c] mb-1">Su quali pagine? (opzionale)</label>
                      <Input
                        value={formData.condition_page_pattern}
                        onChange={(e) => setFormData({ ...formData, condition_page_pattern: e.target.value })}
                        placeholder="Es: /camere/* per tutte le camere"
                      />
                    </div>
                  </div>
                )}

                {formData.rule_type === "room_interest" && (
                  <div className="p-3 bg-[#f8f7f4] rounded-lg">
                    <label className="block text-sm text-[#5c5c5c] mb-1">Dopo quante camere visitate?</label>
                    <Input
                      type="number"
                      min={1}
                      value={formData.condition_value}
                      onChange={(e) =>
                        setFormData({ ...formData, condition_value: Number.parseInt(e.target.value) || 1 })
                      }
                    />
                  </div>
                )}

                {formData.rule_type === "return_visitor" && (
                  <div className="p-3 bg-[#f8f7f4] rounded-lg space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm text-[#5c5c5c] mb-1">Da giorni</label>
                        <Input
                          type="number"
                          min={1}
                          value={formData.condition_min_days}
                          onChange={(e) =>
                            setFormData({ ...formData, condition_min_days: Number.parseInt(e.target.value) || 1 })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-[#5c5c5c] mb-1">A giorni</label>
                        <Input
                          type="number"
                          min={1}
                          value={formData.condition_max_days}
                          onChange={(e) =>
                            setFormData({ ...formData, condition_max_days: Number.parseInt(e.target.value) || 7 })
                          }
                        />
                      </div>
                    </div>
                    <p className="text-xs text-[#8b8b8b]">
                      Mostra a chi torna tra {formData.condition_min_days} e {formData.condition_max_days} giorni
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-[#5c5c5c] mb-2">Come mostrare</label>
                  <div className="flex gap-3">
                    <label
                      className={`flex-1 flex items-center justify-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                        formData.message_type === "popup"
                          ? "border-[#8b7355] bg-[#8b7355]/5"
                          : "border-[#e5e5e5] hover:bg-[#f8f7f4]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="message_type"
                        value="popup"
                        checked={formData.message_type === "popup"}
                        onChange={() => setFormData({ ...formData, message_type: "popup" })}
                        className="sr-only"
                      />
                      <span className="text-sm font-medium">Popup</span>
                    </label>
                    <label
                      className={`flex-1 flex items-center justify-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                        formData.message_type === "chat"
                          ? "border-[#8b7355] bg-[#8b7355]/5"
                          : "border-[#e5e5e5] hover:bg-[#f8f7f4]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="message_type"
                        value="chat"
                        checked={formData.message_type === "chat"}
                        onChange={() => setFormData({ ...formData, message_type: "chat" })}
                        className="sr-only"
                      />
                      <span className="text-sm font-medium">Chat</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Right - Message Content + Preview */}
              <div className="space-y-4">
                {formData.message_type === "popup" && (
                  <div>
                    <label className="block text-sm font-medium text-[#5c5c5c] mb-1">Titolo (opzionale)</label>
                    <Input
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Es: Offerta Speciale!"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-[#5c5c5c] mb-1">Messaggio *</label>
                  <Textarea
                    value={formData.body}
                    onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                    placeholder="Il testo che vedrà il visitatore..."
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[#5c5c5c] mb-1">Testo pulsante</label>
                    <Input
                      value={formData.cta_text}
                      onChange={(e) => setFormData({ ...formData, cta_text: e.target.value })}
                      placeholder="Es: Scopri di più"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#5c5c5c] mb-1">Link pulsante</label>
                    <Input
                      value={formData.cta_url}
                      onChange={(e) => setFormData({ ...formData, cta_url: e.target.value })}
                      placeholder="Es: /offerte"
                    />
                  </div>
                </div>

                {/* Preview */}
                <div className="mt-6">
                  <label className="block text-sm font-medium text-[#5c5c5c] mb-2">Anteprima</label>
                  <div className="bg-[#f8f7f4] rounded-lg p-4 min-h-[200px] flex items-center justify-center">
                    {formData.message_type === "popup" ? (
                      <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full">
                        {formData.title && (
                          <h3 className="text-lg font-semibold text-[#5c5c5c] mb-2">{formData.title}</h3>
                        )}
                        <p className="text-[#8b8b8b] text-sm mb-4">
                          {formData.body || "Il tuo messaggio apparirà qui..."}
                        </p>
                        {formData.cta_text && (
                          <button className="w-full bg-[#8b7355] text-white py-2 px-4 rounded-lg text-sm font-medium">
                            {formData.cta_text}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="bg-white rounded-xl shadow-lg p-4 max-w-xs w-full">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 bg-[#8b7355] rounded-full flex items-center justify-center text-white text-xs">
                            HA
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-[#5c5c5c]">
                              {formData.body || "Il tuo messaggio apparirà qui..."}
                            </p>
                            {formData.cta_text && (
                              <button className="mt-2 text-xs text-[#8b7355] font-medium">{formData.cta_text} →</button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-[#e5e5e5]">
              <Button variant="outline" onClick={resetForm} disabled={isSaving}>
                Annulla
              </Button>
              <Button onClick={handleSave} disabled={isSaving} className="bg-[#8b7355] hover:bg-[#6b5a45]">
                {isSaving ? "Salvataggio..." : editingRule ? "Salva Modifiche" : "Crea Messaggio"}
              </Button>
            </div>
          </div>
        )}

        {/* Rules List */}
        {!showForm && (
          <>
            {rules.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#e5e5e5] p-12 text-center">
                <Megaphone className="w-12 h-12 text-[#8b8b8b] mx-auto mb-4" />
                <h3 className="text-lg font-medium text-[#5c5c5c] mb-2">Nessun messaggio configurato</h3>
                <p className="text-[#8b8b8b] mb-6">Crea il tuo primo messaggio per coinvolgere i visitatori del sito</p>
                <Button onClick={() => setShowForm(true)} className="bg-[#8b7355] hover:bg-[#6b5a45]">
                  <Plus className="w-4 h-4 mr-2" />
                  Crea Messaggio
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="bg-white rounded-xl border border-[#e5e5e5] p-4 flex items-center gap-4"
                  >
                    {/* Toggle */}
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={() => handleToggleActive(rule)}
                      className="data-[state=checked]:bg-[#8b7355]"
                    />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-[#5c5c5c] truncate">{rule.name}</h3>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            rule.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {rule.is_active ? "Attivo" : "Disattivato"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-[#8b8b8b]">
                        <span>{RULE_TYPE_LABELS[rule.rule_type]?.label}</span>
                        <span>•</span>
                        <span>{MESSAGE_TYPE_LABELS[rule.message_type]}</span>
                        <span>•</span>
                        <span>{rule.impressions_count} visualizzazioni</span>
                        <span>•</span>
                        <span>{rule.clicks_count} click</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewRule(rule)}
                        className="text-[#8b8b8b] hover:text-[#5c5c5c]"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(rule)}
                        className="text-[#8b8b8b] hover:text-[#5c5c5c]"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(rule)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Preview Modal */}
        {previewRule && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setPreviewRule(null)}
          >
            <div className="bg-white rounded-xl p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-medium text-[#5c5c5c] mb-4">Anteprima: {previewRule.name}</h3>

              <div className="bg-[#f8f7f4] rounded-lg p-4 min-h-[200px] flex items-center justify-center">
                {previewRule.message_type === "popup" ? (
                  <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full">
                    {previewRule.message_content.title && (
                      <h3 className="text-lg font-semibold text-[#5c5c5c] mb-2">{previewRule.message_content.title}</h3>
                    )}
                    <p className="text-[#8b8b8b] text-sm mb-4">{previewRule.message_content.body}</p>
                    {previewRule.message_content.cta_text && (
                      <button className="w-full bg-[#8b7355] text-white py-2 px-4 rounded-lg text-sm font-medium">
                        {previewRule.message_content.cta_text}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl shadow-lg p-4 max-w-xs w-full">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-[#8b7355] rounded-full flex items-center justify-center text-white text-xs">
                        HA
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-[#5c5c5c]">{previewRule.message_content.body}</p>
                        {previewRule.message_content.cta_text && (
                          <button className="mt-2 text-xs text-[#8b7355] font-medium">
                            {previewRule.message_content.cta_text} →
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-4">
                <Button variant="outline" onClick={() => setPreviewRule(null)}>
                  Chiudi
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
