"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Building2, Plus, Eye, Ban, CheckCircle, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

type StructureStatus = "active" | "trial" | "suspended"

interface Structure {
  id: string
  name: string
  property_id: string
  status: StructureStatus
  plan: string
  users_count: number
  inbox_enabled: boolean
  last_activity: string | null
  created_at: string
}

// Mock data for UI demonstration
const mockStructures: Structure[] = [
  {
    id: "1",
    name: "Villa I Barronci",
    property_id: "prop_001",
    status: "active",
    plan: "Professional",
    users_count: 5,
    inbox_enabled: true,
    last_activity: "2025-01-10T14:30:00",
    created_at: "2024-01-01T00:00:00",
  },
  {
    id: "2",
    name: "Hotel Belvedere",
    property_id: "prop_002",
    status: "active",
    plan: "Enterprise",
    users_count: 12,
    inbox_enabled: true,
    last_activity: "2025-01-10T12:15:00",
    created_at: "2024-02-15T00:00:00",
  },
  {
    id: "3",
    name: "Agriturismo La Fonte",
    property_id: "prop_003",
    status: "trial",
    plan: "Trial",
    users_count: 2,
    inbox_enabled: false,
    last_activity: "2025-01-09T16:45:00",
    created_at: "2024-12-20T00:00:00",
  },
  {
    id: "4",
    name: "B&B Casa Vacanze",
    property_id: "prop_004",
    status: "suspended",
    plan: "Basic",
    users_count: 3,
    inbox_enabled: false,
    last_activity: "2024-11-15T10:20:00",
    created_at: "2024-03-10T00:00:00",
  },
]

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

export default function StructuresPage() {
  const [structures, setStructures] = useState<Structure[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStructures()
  }, [])

  const fetchStructures = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch("/api/super-admin/structures")
      if (!response.ok) {
        throw new Error("Impossibile caricare le strutture")
      }
      const data = await response.json()
      console.log("[v0] Structures received:", data.structures) // Debug per verificare i dati
      setStructures(data.structures || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Si è verificato un errore")
      console.error("Errore nel caricamento delle strutture:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleStatus = async (structure: Structure) => {
    const endpoint = structure.status === "suspended" ? "activate" : "suspend"
    const action = structure.status === "suspended" ? "attivare" : "sospendere"
    try {
      const response = await fetch(`/api/super-admin/structures/${structure.id}/${endpoint}`, {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error(`Impossibile ${action} la struttura`)
      }

      await fetchStructures()
    } catch (err) {
      console.error(`Errore durante il cambio stato:`, err)
      alert(`Impossibile ${action} la struttura`)
    }
  }

  const handleImpersonate = (structure: Structure) => {
    console.log(`Impersonando struttura: ${structure.name}`)
    alert("Impersonificazione: Funzionalità in arrivo - reindirizzamento alla vista tenant in modalità SOLA LETTURA")
  }

  const filteredStructures = structures.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.property_id.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <p className="text-neutral-500">Caricamento strutture...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={fetchStructures}>Riprova</Button>
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
            <div className="flex items-center gap-3">
              <Building2 className="w-6 h-6 text-neutral-600" />
              <h1 className="text-xl font-semibold text-neutral-800">Strutture</h1>
            </div>
            <Button className="bg-neutral-800 hover:bg-neutral-700 text-white">
              <Plus className="w-4 h-4 mr-2" />
              Crea struttura
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search */}
        <div className="mb-6">
          <Input
            type="search"
            placeholder="Cerca strutture per nome o ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Nome
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Stato
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Piano
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Utenti
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Inbox
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Ultima attività
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Azioni
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-neutral-200">
                {filteredStructures.map((structure) => (
                  <tr key={structure.id} className={structure.status === "suspended" ? "opacity-50" : ""}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-neutral-900">{structure.name}</div>
                      <div className="text-xs text-neutral-500">{structure.property_id || structure.id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={getStatusBadgeVariant(structure.status)}>{structure.status}</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-700">{structure.plan}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-700">{structure.users_count}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={structure.inbox_enabled ? "default" : "outline"}>
                        {structure.inbox_enabled ? "Attivo" : "Disattivo"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                      {formatDate(structure.last_activity)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/super-admin/structures/${structure.id}`}>
                          <Button variant="outline" size="sm">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button variant="outline" size="sm" onClick={() => handleImpersonate(structure)}>
                          <User className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleToggleStatus(structure)}>
                          {structure.status === "suspended" ? (
                            <CheckCircle className="w-4 h-4" />
                          ) : (
                            <Ban className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {filteredStructures.length === 0 && (
          <div className="text-center py-12">
            <p className="text-neutral-500">Nessuna struttura trovata</p>
          </div>
        )}
      </div>
    </div>
  )
}
