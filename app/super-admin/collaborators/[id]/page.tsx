"use client"

import { use, useState, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, AlertTriangle, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

type CollaboratorRole = "super_admin" | "platform_admin" | "support" | "sales" | "tech"
type CollaboratorStatus = "active" | "suspended"

interface Collaborator {
  id: string
  name: string
  email: string
  role: CollaboratorRole
  status: CollaboratorStatus
  last_login: string | null
  created_at: string
}

interface Activity {
  id: string
  timestamp: string
  action: string
  entity_type: string
  entity_id: string
  result: "success" | "failure"
}

// Mock data for UI demonstration
const mockCollaborator: Collaborator = {
  id: "1",
  name: "Platform Manager",
  email: "manager@hotelaccelerator.com",
  role: "platform_admin",
  status: "active",
  last_login: "2025-01-10T14:30:00",
  created_at: "2024-02-15T00:00:00",
}

const mockActivities: Activity[] = [
  {
    id: "1",
    timestamp: "2025-01-10T14:30:00",
    action: "updated_tenant",
    entity_type: "tenant",
    entity_id: "tenant_123",
    result: "success",
  },
  {
    id: "2",
    timestamp: "2025-01-10T13:15:00",
    action: "created_user",
    entity_type: "user",
    entity_id: "user_456",
    result: "success",
  },
  {
    id: "3",
    timestamp: "2025-01-10T12:00:00",
    action: "deleted_channel",
    entity_type: "channel",
    entity_id: "channel_789",
    result: "failure",
  },
  {
    id: "4",
    timestamp: "2025-01-09T16:45:00",
    action: "login",
    entity_type: "auth",
    entity_id: "session_abc",
    result: "success",
  },
]

const getRoleBadgeVariant = (role: CollaboratorRole) => {
  switch (role) {
    case "super_admin":
      return "destructive"
    case "platform_admin":
      return "default"
    case "support":
      return "secondary"
    case "sales":
      return "outline"
    case "tech":
      return "outline"
    default:
      return "outline"
  }
}

const getStatusBadgeVariant = (status: CollaboratorStatus) => {
  return status === "active" ? "default" : "outline"
}

const getResultBadgeVariant = (result: "success" | "failure") => {
  return result === "success" ? "default" : "destructive"
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return "Mai"
  return new Date(dateString).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function CollaboratorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [collaborator, setCollaborator] = useState<Collaborator | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchCollaboratorData()
  }, [id])

  const fetchCollaboratorData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch collaborator details
      const collaboratorRes = await fetch(`/api/super-admin/collaborators/${id}`)
      if (!collaboratorRes.ok) {
        throw new Error("Collaborator not found")
      }
      const collaboratorData = await collaboratorRes.json()
      setCollaborator(collaboratorData.collaborator)

      // Fetch activity logs
      const activityRes = await fetch(`/api/super-admin/collaborators/${id}/activity?limit=20`)
      if (activityRes.ok) {
        const activityData = await activityRes.json()
        setActivities(activityData.activities || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      console.error("Error fetching collaborator data:", err)
    } finally {
      setLoading(false)
    }
  }

  // Risk indicators (calculated from real data)
  const failedActionsCount = activities.filter((a) => a.result === "failure").length
  const totalActionsCount = activities.length
  const hasHighFailureRate = failedActionsCount > 2
  const hasHighActivityVolume = totalActionsCount > 50

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center">
        <p className="text-[#8b8b8b]">Loading collaborator details...</p>
      </div>
    )
  }

  if (error || !collaborator) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || "Collaborator not found"}</p>
          <Link href="/super-admin/collaborators">
            <Button>Back to Collaborators</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      {/* Header */}
      <header className="bg-white border-b border-[#e5e5e5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/super-admin/collaborators">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              </Link>
              <h1 className="text-xl font-serif text-[#5c5c5c]">Collaborator Details</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Profile */}
          <div className="lg:col-span-1 space-y-6">
            {/* Profile Card */}
            <div className="bg-white rounded-xl border border-[#e5e5e5] p-6">
              <h2 className="text-lg font-medium text-[#5c5c5c] mb-4">Profile</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-[#8b8b8b] mb-1">Name</p>
                  <p className="text-sm font-medium text-[#5c5c5c]">{collaborator.name}</p>
                </div>
                <div>
                  <p className="text-sm text-[#8b8b8b] mb-1">Email</p>
                  <p className="text-sm font-medium text-[#5c5c5c]">{collaborator.email}</p>
                </div>
                <div>
                  <p className="text-sm text-[#8b8b8b] mb-1">Role</p>
                  <Badge variant={getRoleBadgeVariant(collaborator.role)}>{collaborator.role}</Badge>
                </div>
                <div>
                  <p className="text-sm text-[#8b8b8b] mb-1">Status</p>
                  <Badge variant={getStatusBadgeVariant(collaborator.status)}>{collaborator.status}</Badge>
                </div>
                <div>
                  <p className="text-sm text-[#8b8b8b] mb-1">Created At</p>
                  <p className="text-sm font-medium text-[#5c5c5c]">{formatDate(collaborator.created_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-[#8b8b8b] mb-1">Last Login</p>
                  <p className="text-sm font-medium text-[#5c5c5c]">{formatDate(collaborator.last_login)}</p>
                </div>
              </div>
            </div>

            {/* Risk Indicators Card */}
            <div className="bg-white rounded-xl border border-[#e5e5e5] p-6">
              <h2 className="text-lg font-medium text-[#5c5c5c] mb-4">Risk Indicators</h2>
              <div className="space-y-3">
                {hasHighFailureRate && (
                  <div className="flex items-center gap-2 text-sm text-orange-600">
                    <AlertTriangle className="w-4 h-4" />
                    <span>High failure rate ({failedActionsCount} failures)</span>
                  </div>
                )}
                {hasHighActivityVolume && (
                  <div className="flex items-center gap-2 text-sm text-blue-600">
                    <TrendingUp className="w-4 h-4" />
                    <span>High activity volume</span>
                  </div>
                )}
                {!hasHighFailureRate && !hasHighActivityVolume && (
                  <p className="text-sm text-[#8b8b8b]">No risk indicators</p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Recent Activity */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-[#e5e5e5] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#e5e5e5]">
                <h2 className="text-lg font-medium text-[#5c5c5c]">Recent Activity</h2>
                <p className="text-sm text-[#8b8b8b] mt-1">Last 20 actions</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#f8f7f4] border-b border-[#e5e5e5]">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-[#8b8b8b] uppercase tracking-wider">
                        Timestamp
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-[#8b8b8b] uppercase tracking-wider">
                        Action
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-[#8b8b8b] uppercase tracking-wider">
                        Entity Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-[#8b8b8b] uppercase tracking-wider">
                        Entity ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-[#8b8b8b] uppercase tracking-wider">
                        Result
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-[#e5e5e5]">
                    {activities.map((activity) => (
                      <tr key={activity.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-[#8b8b8b]">
                          {formatDate(activity.timestamp)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-[#5c5c5c]">{activity.action}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-[#8b8b8b]">{activity.entity_type}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <code className="text-xs text-[#8b8b8b] bg-[#f8f7f4] px-2 py-1 rounded">
                            {activity.entity_id}
                          </code>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant={getResultBadgeVariant(activity.result)}>{activity.result}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
