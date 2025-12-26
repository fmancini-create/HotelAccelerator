"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Building2, ArrowLeft, User, AlertTriangle, MessageSquare, Zap, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"

type StructureStatus = "active" | "trial" | "suspended"

interface StructureDetail {
  id: string
  name: string
  property_id: string
  status: StructureStatus
  plan: string
  users_count: number
  inbox_enabled: boolean
  created_at: string
}

interface UsageMetrics {
  conversations_count: number
  write_commands_7d: number
  errors_7d: number
}

const getStatusBadgeVariant = (status: StructureStatus) => {
  switch (status) {
    case "active":
      return "default"
    case "trial":
      return "secondary"
    case "suspended":
      return "outline"
    default:
      return "outline"
  }
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function StructureDetailPage() {
  const params = useParams()
  const router = useRouter()
  const structureId = params.id as string

  const [structure, setStructure] = useState<StructureDetail | null>(null)
  const [usage, setUsage] = useState<UsageMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStructureData()
  }, [structureId])

  const fetchStructureData = async () => {
    try {
      setLoading(true)
      setError(null)

      const structureRes = await fetch(`/api/super-admin/structures/${structureId}`)
      if (!structureRes.ok) {
        throw new Error("Structure not found")
      }
      const structureData = await structureRes.json()
      setStructure(structureData.structure)

      const usageRes = await fetch(`/api/super-admin/structures/${structureId}/usage`)
      if (usageRes.ok) {
        const usageData = await usageRes.json()
        setUsage(usageData.usage)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      console.error("Error fetching structure data:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (newStatus: StructureStatus) => {
    if (!structure) return

    const endpoint = newStatus === "suspended" ? "suspend" : "activate"
    try {
      const response = await fetch(`/api/super-admin/structures/${structureId}/${endpoint}`, {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error(`Failed to ${endpoint} structure`)
      }

      await fetchStructureData()
    } catch (err) {
      console.error("Error updating status:", err)
      alert("Failed to update structure status")
    }
  }

  const handleImpersonate = () => {
    if (!structure) return
    console.log(`Impersonating structure: ${structure.name}`)
    alert("Impersonation: Feature coming soon - will redirect to tenant view in READ-ONLY mode")
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <p className="text-neutral-500">Loading structure details...</p>
      </div>
    )
  }

  if (error || !structure) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || "Structure not found"}</p>
          <Button onClick={() => router.push("/super-admin/structures")}>Back to Structures</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => router.push("/super-admin/structures")}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-3">
                <Building2 className="w-6 h-6 text-neutral-600" />
                <div>
                  <h1 className="text-xl font-semibold text-neutral-800">{structure.name}</h1>
                  <p className="text-xs text-neutral-500">{structure.property_id}</p>
                </div>
              </div>
            </div>
            <Button onClick={handleImpersonate} variant="outline">
              <User className="w-4 h-4 mr-2" />
              View as tenant
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid gap-6">
          {/* Overview Section */}
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
              <CardDescription>Basic structure information</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Status</p>
                  <Badge variant={getStatusBadgeVariant(structure.status)}>{structure.status}</Badge>
                </div>
                <div>
                  <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Plan</p>
                  <p className="text-sm font-medium text-neutral-900">{structure.plan}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Users</p>
                  <p className="text-sm font-medium text-neutral-900">{structure.users_count}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Created</p>
                  <p className="text-sm font-medium text-neutral-900">{formatDate(structure.created_at)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Status & Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Status & Controls</CardTitle>
              <CardDescription>Change structure status and availability</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium text-neutral-700 mb-2 block">Structure Status</label>
                  <Select
                    value={structure.status}
                    onValueChange={(value) => handleStatusChange(value as StructureStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="trial">Trial</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {structure.status === "suspended" && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    This structure is currently suspended. Users cannot access their dashboard or inbox.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Usage Snapshot */}
          <Card>
            <CardHeader>
              <CardTitle>Usage Snapshot</CardTitle>
              <CardDescription>Activity metrics for the last 7 days</CardDescription>
            </CardHeader>
            <CardContent>
              {usage ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <MessageSquare className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-neutral-900">{usage.conversations_count}</p>
                      <p className="text-sm text-neutral-500">Total Conversations</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-green-50 rounded-lg">
                      <Zap className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-neutral-900">{usage.write_commands_7d}</p>
                      <p className="text-sm text-neutral-500">Write Commands (7d)</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-red-50 rounded-lg">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-neutral-900">{usage.errors_7d}</p>
                      <p className="text-sm text-neutral-500">Errors (7d)</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-neutral-500">Loading usage metrics...</p>
              )}
            </CardContent>
          </Card>

          {/* Impersonation Section */}
          <Card>
            <CardHeader>
              <CardTitle>Impersonation</CardTitle>
              <CardDescription>Access tenant view for support purposes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Alert>
                  <AlertDescription>
                    Impersonation mode grants you READ-ONLY access to this tenant's dashboard. All actions will be
                    logged.
                  </AlertDescription>
                </Alert>
                <Button onClick={handleImpersonate} variant="outline" className="w-full bg-transparent">
                  <User className="w-4 h-4 mr-2" />
                  View as tenant (Read-only)
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
