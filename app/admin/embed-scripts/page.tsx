"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Eye, Edit, Copy, Trash2, Code } from "lucide-react"
import Link from "next/link"
import { useAdminAuth } from "@/lib/admin-hooks"
import type { EmbedScript } from "@/lib/types/embed-script.types"
import { AdminHeader } from "@/components/admin/admin-header"

export default function EmbedScriptsPage() {
  const { isLoading, adminUser, logout } = useAdminAuth()
  const [scripts, setScripts] = useState<EmbedScript[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchScripts()
  }, [])

  const fetchScripts = async () => {
    try {
      const res = await fetch("/api/admin/embed-scripts")
      const data = await res.json()
      setScripts(data.scripts || [])
    } catch (error) {
      console.error("Errore caricamento script:", error)
    } finally {
      setLoading(false)
    }
  }

  const copyScriptCode = (scriptId: string) => {
    const code = `<script src="${window.location.origin}/embed.js?script=${scriptId}"></script>`
    navigator.clipboard.writeText(code)
    alert("Codice copiato negli appunti!")
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      active: "default",
      paused: "secondary",
      draft: "outline",
    } as const

    const labels = {
      active: "Attivo",
      paused: "In pausa",
      draft: "Bozza",
    }

    return <Badge variant={variants[status as keyof typeof variants]}>{labels[status as keyof typeof labels]}</Badge>
  }

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#8b7355]"></div>
      </div>
    )
  }

  if (!adminUser) {
    return null
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <AdminHeader
        title="Script Embed"
        subtitle="Gestisci gli script per siti esterni"
        breadcrumbs={[{ label: "Script Embed", href: "/admin/embed-scripts" }]}
        actions={
          <Link href="/admin/embed-scripts/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nuovo Script
            </Button>
          </Link>
        }
      />

      <main className="min-h-screen bg-[#f8f7f4]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            {scripts.length === 0 ? (
              <Card className="p-12 text-center bg-white border-[#e5e5e5]">
                <Code className="w-12 h-12 mx-auto text-[#8b8b8b] mb-4" />
                <h3 className="text-lg font-semibold text-[#5c5c5c] mb-2">Nessuno script creato</h3>
                <p className="text-[#8b8b8b] mb-6">
                  Crea il tuo primo script embed per integrare widget sul tuo sito web
                </p>
                <Link href="/admin/embed-scripts/new">
                  <Button className="bg-[#8b7355] hover:bg-[#6d5a43]">
                    <Plus className="w-4 h-4 mr-2" />
                    Crea Primo Script
                  </Button>
                </Link>
              </Card>
            ) : (
              <div className="grid gap-4">
                {scripts.map((script) => (
                  <Card
                    key={script.id}
                    className="p-6 bg-white border-[#e5e5e5] hover:border-[#8b7355] transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-[#5c5c5c]">{script.name}</h3>
                          {getStatusBadge(script.status)}
                        </div>
                        {script.description && <p className="text-[#8b8b8b] text-sm mb-3">{script.description}</p>}
                        <div className="flex items-center gap-4 text-sm text-[#8b8b8b]">
                          <span>Destinazione: {script.destination_url}</span>
                          <span>•</span>
                          <span>{script.views_count || 0} visualizzazioni</span>
                          <span>•</span>
                          <span>{script.interactions_count || 0} interazioni</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => copyScriptCode(script.id)}>
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Link href={`/admin/embed-scripts/${script.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Link href={`/admin/embed-scripts/${script.id}/edit`}>
                          <Button variant="ghost" size="sm">
                            <Edit className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (confirm("Sei sicuro di voler eliminare questo script?")) {
                              await fetch(`/api/admin/embed-scripts/${script.id}`, {
                                method: "DELETE",
                              })
                              fetchScripts()
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
