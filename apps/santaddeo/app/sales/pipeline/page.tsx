"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Plus, RefreshCw, Loader2, Users } from "lucide-react"
import { PipelineBoard, type Deal } from "@/components/sales/pipeline-board"
import { PipelineHeader } from "@/components/sales/pipeline-header"
import { DealDialog } from "@/components/sales/deal-dialog"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type PrefilledDealData = Partial<Deal> & {
  prospect_id?: string | null
  agent_id?: string
  _prospectLabel?: string
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

type Agent = {
  id: string
  display_name: string
  email: string
  is_active: boolean
}

export default function PipelinePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create")
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string>("all")
  const [prefilledData, setPrefilledData] = useState<PrefilledDealData | undefined>(undefined)

  // Carica lista agenti (solo superadmin vedrà dati, altri 403)
  const { data: agentsData } = useSWR<{ agents: Agent[] }>(
    "/api/sales/agents",
    fetcher,
    { revalidateOnFocus: false }
  )
  
  const isSuperAdmin = !!agentsData?.agents && agentsData.agents.length > 0

  // URL deals con filtro agente
  const dealsUrl = useMemo(() => {
    if (selectedAgentId && selectedAgentId !== "all") {
      return `/api/sales/deals?agent_id=${selectedAgentId}`
    }
    return "/api/sales/deals"
  }, [selectedAgentId])

  const { data, error, isLoading, mutate } = useSWR<{
    deals: Deal[]
    kpi: {
      pipeline_total: number
      pipeline_weighted: number
      deals_active: number
      conversion_rate_90d: number
    }
  }>(dealsUrl, fetcher, {
    refreshInterval: 30000, // Refresh ogni 30s
  })

  /**
   * Quando arriviamo da /sales/prospects con ?create_from_prospect=<id>,
   * carichiamo il prospect, prefilliamo il dialog "Nuovo Deal" e puliamo l'URL.
   * L'effect parte solo quando cambia il param, ed è idempotente sul mount.
   */
  useEffect(() => {
    const prospectId = searchParams.get("create_from_prospect")
    if (!prospectId) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/sales/prospects/${prospectId}`)
        if (!res.ok) {
          toast.error("Impossibile caricare il prospect")
          return
        }
        const { prospect } = await res.json() as {
          prospect: {
            id: string
            name: string
            phone: string | null
            email: string | null
            stars: number | null
            rooms_count: number | null
            city: string | null
            region: string | null
          }
        }
        if (cancelled || !prospect) return

        const locationParts = [prospect.city, prospect.region].filter(Boolean)
        const prefill: PrefilledDealData = {
          prospect_id: prospect.id,
          prospect_name: prospect.name,
          prospect_hotel_name: prospect.name,
          prospect_email: prospect.email || "",
          prospect_phone: prospect.phone || "",
          prospect_stars: prospect.stars ?? undefined,
          prospect_rooms: prospect.rooms_count ?? undefined,
          prospect_location: locationParts.join(", "),
          stage: "lead",
          probability: 10,
          _prospectLabel: [prospect.name, locationParts.join(" - ")].filter(Boolean).join(" — "),
        }
        setPrefilledData(prefill)
        setSelectedDeal(null)
        setDialogMode("create")
        setDialogOpen(true)

        // Rimuovi il query param senza ricaricare
        const params = new URLSearchParams(searchParams.toString())
        params.delete("create_from_prospect")
        router.replace(`/sales/pipeline${params.toString() ? `?${params}` : ""}`, { scroll: false })
      } catch (err) {
        console.error("[v0] [pipeline] error loading prospect for prefill:", err)
        toast.error("Errore nel caricamento del prospect")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [searchParams, router])

  const handleStageChange = useCallback(async (dealId: string, newStage: string) => {
    setIsUpdating(true)
    try {
      const res = await fetch(`/api/sales/deals/${dealId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      })
      
      if (!res.ok) {
        throw new Error("Errore nel cambio stage")
      }

      const { deal: updatedDeal } = await res.json()
      
      // Aggiorna cache SWR
      mutate(
        current => {
          if (!current) return current
          return {
            ...current,
            deals: current.deals.map(d => 
              d.id === dealId ? { ...d, ...updatedDeal } : d
            ),
          }
        },
        { revalidate: false }
      )

      toast.success(`Deal spostato in "${newStage}"`)
    } catch (err) {
      toast.error("Errore nel cambio stage")
      console.error(err)
    } finally {
      setIsUpdating(false)
    }
  }, [mutate])

  const handleDealClick = useCallback((deal: Deal) => {
    setSelectedDeal(deal)
    setDialogMode("edit")
    setDialogOpen(true)
  }, [])

  const handleCreateDeal = useCallback(() => {
    setSelectedDeal(null)
    setPrefilledData(undefined)
    setDialogMode("create")
    setDialogOpen(true)
  }, [])

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false)
    // Pulisci prefill al close per non riproporlo a "Nuovo Deal" successivo
    setTimeout(() => setPrefilledData(undefined), 200)
  }, [])

  const handleSaveDeal = useCallback(async (formData: Partial<Deal>) => {
    const isEdit = dialogMode === "edit" && selectedDeal
    const url = isEdit 
      ? `/api/sales/deals/${selectedDeal.id}`
      : "/api/sales/deals"
    const method = isEdit ? "PATCH" : "POST"

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || "Errore nel salvataggio")
    }

    toast.success(isEdit ? "Deal aggiornato" : "Deal creato")
    mutate() // Refresh completo
  }, [dialogMode, selectedDeal, mutate])

  const handleDeleteDeal = useCallback(async (dealId: string) => {
    const res = await fetch(`/api/sales/deals/${dealId}`, {
      method: "DELETE",
    })

    if (!res.ok) {
      throw new Error("Errore nell'eliminazione")
    }

    toast.success("Deal eliminato")
    mutate()
  }, [mutate])

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600">Errore nel caricamento della pipeline</p>
        <Button variant="outline" onClick={() => mutate()} className="mt-4">
          Riprova
        </Button>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Pipeline Trattative</h1>
          <p className="text-sm text-muted-foreground">
            {isSuperAdmin 
              ? "Visualizza e gestisci le trattative di tutti gli agenti"
              : "Gestisci le tue opportunita commerciali"
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Selettore agente (solo superadmin) */}
          {isSuperAdmin && agentsData?.agents && (
            <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
              <SelectTrigger className="flex-1 sm:w-[220px]">
                <Users className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Tutti gli agenti" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli agenti</SelectItem>
                {agentsData.agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.display_name || agent.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutate()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 sm:mr-2 ${isLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Aggiorna</span>
          </Button>
          <Button onClick={handleCreateDeal} className="flex-1 sm:flex-none">
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Deal
          </Button>
        </div>
      </div>

      {/* KPI Header */}
      {data?.kpi && (
        <PipelineHeader
          pipelineTotal={data.kpi.pipeline_total}
          pipelineWeighted={data.kpi.pipeline_weighted}
          dealsActive={data.kpi.deals_active}
          conversionRate={data.kpi.conversion_rate_90d}
        />
      )}

      {/* Pipeline Board */}
      {isLoading && !data ? (
        <div className="flex items-center justify-center h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <PipelineBoard
          deals={data?.deals || []}
          onStageChange={handleStageChange}
          onDealClick={handleDealClick}
          isLoading={isUpdating}
        />
      )}

      {/* Deal Dialog */}
      <DealDialog
        deal={selectedDeal}
        isOpen={dialogOpen}
        onClose={handleCloseDialog}
        onSave={handleSaveDeal}
        onDelete={handleDeleteDeal}
        mode={dialogMode}
        agents={agentsData?.agents}
        isSuperAdmin={isSuperAdmin}
        prefilledData={prefilledData}
      />
    </div>
  )
}
