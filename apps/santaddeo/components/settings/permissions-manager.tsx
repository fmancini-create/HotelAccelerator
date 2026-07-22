"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Shield, Lock, Unlock, RotateCcw } from "lucide-react"
import { useRouter } from "next/navigation"

interface PermissionsManagerProps {
  userId: string
  userName: string
  userRole: string
  canManagePermissions: boolean
}

interface Feature {
  id: string
  code: string
  name: string
  description: string | null
  category: string
}

interface UserPermission {
  feature_code: string
  is_allowed: boolean
  source: "role" | "override"
}

export function PermissionsManager({ userId, userName, userRole, canManagePermissions }: PermissionsManagerProps) {
  const router = useRouter()
  const [features, setFeatures] = useState<Record<string, Feature[]>>({})
  const [permissions, setPermissions] = useState<UserPermission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [userId])

  const loadData = async () => {
    setIsLoading(true)
    try {
      // Load features
      const featuresRes = await fetch("/api/team/features")
      const featuresData = await featuresRes.json()
      setFeatures(featuresData.features || {})

      // Load user permissions
      const permissionsRes = await fetch(`/api/team/permissions/${userId}`)
      const permissionsData = await permissionsRes.json()
      setPermissions(permissionsData.permissions || [])
    } catch (error) {
      console.error("Error loading permissions:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleTogglePermission = async (featureCode: string, currentValue: boolean) => {
    if (!canManagePermissions) return

    setIsSaving(true)
    try {
      const response = await fetch(`/api/team/permissions/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feature_code: featureCode,
          is_allowed: !currentValue,
        }),
      })

      if (!response.ok) throw new Error("Failed to update permission")

      // Update local state
      setPermissions((prev) =>
        prev.map((p) => (p.feature_code === featureCode ? { ...p, is_allowed: !currentValue, source: "override" } : p)),
      )

      router.refresh()
    } catch (error) {
      console.error("Error updating permission:", error)
      alert("Errore durante l'aggiornamento del permesso")
    } finally {
      setIsSaving(false)
    }
  }

  const handleResetPermission = async (featureCode: string) => {
    if (!canManagePermissions) return

    setIsSaving(true)
    try {
      const response = await fetch(`/api/team/permissions/${userId}?feature_code=${featureCode}`, {
        method: "DELETE",
      })

      if (!response.ok) throw new Error("Failed to reset permission")

      // Reload permissions to get role default
      await loadData()
      router.refresh()
    } catch (error) {
      console.error("Error resetting permission:", error)
      alert("Errore durante il ripristino del permesso")
    } finally {
      setIsSaving(false)
    }
  }

  const getPermissionValue = (featureCode: string): { isAllowed: boolean; source: "role" | "override" } => {
    const permission = permissions.find((p) => p.feature_code === featureCode)
    return {
      isAllowed: permission?.is_allowed ?? false,
      source: permission?.source ?? "role",
    }
  }

  const getCategoryLabel = (category: string): string => {
    const labels: Record<string, string> = {
      core: "Funzionalità Base",
      data: "Gestione Dati",
      management: "Gestione",
      advanced: "Funzionalità Avanzate",
    }
    return labels[category] || category
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "core":
        return "📊"
      case "data":
        return "💾"
      case "management":
        return "⚙️"
      case "advanced":
        return "🚀"
      default:
        return "📋"
    }
  }

  if (isLoading) {
    return <div className="text-center py-8">Caricamento permessi...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Permessi per {userName}
          </h3>
          <p className="text-sm text-muted-foreground">
            Ruolo: <Badge variant="outline">{userRole}</Badge>
          </p>
        </div>
      </div>

      <Tabs defaultValue={Object.keys(features)[0]} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          {Object.keys(features).map((category) => (
            <TabsTrigger key={category} value={category}>
              {getCategoryIcon(category)} {getCategoryLabel(category)}
            </TabsTrigger>
          ))}
        </TabsList>

        {Object.entries(features).map(([category, categoryFeatures]) => (
          <TabsContent key={category} value={category} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{getCategoryLabel(category)}</CardTitle>
                <CardDescription>Gestisci i permessi per le funzionalità di {category}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {categoryFeatures.map((feature) => {
                  const { isAllowed, source } = getPermissionValue(feature.code)
                  const isOverride = source === "override"

                  return (
                    <div key={feature.code} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{feature.name}</span>
                          {isOverride && (
                            <Badge variant="secondary" className="text-xs">
                              Personalizzato
                            </Badge>
                          )}
                        </div>
                        {feature.description && (
                          <p className="text-sm text-muted-foreground mt-1">{feature.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {isAllowed ? (
                          <Unlock className="h-4 w-4 text-green-600" />
                        ) : (
                          <Lock className="h-4 w-4 text-red-600" />
                        )}

                        <Switch
                          checked={isAllowed}
                          onCheckedChange={() => handleTogglePermission(feature.code, isAllowed)}
                          disabled={!canManagePermissions || isSaving}
                        />

                        {isOverride && canManagePermissions && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResetPermission(feature.code)}
                            disabled={isSaving}
                            title="Ripristina al default del ruolo"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <div className="text-sm text-muted-foreground bg-blue-50 p-4 rounded-lg">
        <p className="font-medium mb-2">ℹ️ Come funzionano i permessi:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Ogni ruolo ha permessi predefiniti</li>
          <li>Puoi personalizzare i permessi per singoli utenti</li>
          <li>I permessi personalizzati sovrascrivono quelli del ruolo</li>
          <li>Usa il pulsante di ripristino per tornare ai permessi del ruolo</li>
        </ul>
      </div>
    </div>
  )
}
