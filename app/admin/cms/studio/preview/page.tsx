"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Monitor, Smartphone, Tablet } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { Button } from "@/components/ui/button"
import { BuilderPreviewNavigator } from "@/components/cms/builder-preview-navigator"
import { CMSBuilderDocumentSchema, type CMSBuilderDocument } from "@/lib/cms/builder-document"

type Breakpoint = "desktop" | "tablet" | "mobile"

export default function CMSStudioPreviewPage() {
  const [document, setDocument] = useState<CMSBuilderDocument | null>(null)
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop")
  const [pageId, setPageId] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/cms/ai-project", { cache: "no-store" })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Impossibile caricare la bozza")
        const validation = CMSBuilderDocumentSchema.safeParse(data.project?.builder_document)
        if (!validation.success) throw new Error("La bozza CMS non è valida")
        setDocument(validation.data)
        setPageId(validation.data.pages[0]?.id || "")
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Errore di caricamento")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const width = useMemo(() => breakpoint === "desktop" ? "100%" : breakpoint === "tablet" ? "820px" : "390px", [breakpoint])

  if (loading) return <div className="flex min-h-[520px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return <div className="space-y-5">
    <AdminHeader title="Anteprima reale CMS" subtitle="Visualizza la bozza con il nuovo renderer, senza pubblicarla" actions={<Button variant="outline" asChild><Link href="/admin/cms/studio/builder"><ArrowLeft className="mr-2 h-4 w-4" />Torna all’editor</Link></Button>} />

    {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}

    {document && <>
      <div className="flex flex-col gap-3 rounded-lg border bg-background p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={breakpoint === "desktop" ? "secondary" : "outline"} onClick={() => setBreakpoint("desktop")}><Monitor className="mr-2 h-4 w-4" />Desktop</Button>
          <Button size="sm" variant={breakpoint === "tablet" ? "secondary" : "outline"} onClick={() => setBreakpoint("tablet")}><Tablet className="mr-2 h-4 w-4" />Tablet</Button>
          <Button size="sm" variant={breakpoint === "mobile" ? "secondary" : "outline"} onClick={() => setBreakpoint("mobile")}><Smartphone className="mr-2 h-4 w-4" />Mobile</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {document.pages.map((page) => <Button key={page.id} size="sm" variant={pageId === page.id ? "default" : "ghost"} onClick={() => setPageId(page.id)}>{page.title}</Button>)}
        </div>
      </div>

      <div className="rounded-lg border border-emerald-600/25 bg-emerald-600/5 p-3 text-sm text-emerald-900">
        I collegamenti del menu navigano ora tra le pagine della bozza senza uscire dall’anteprima e senza generare errori 404.
      </div>

      <div className="overflow-x-auto rounded-xl border bg-muted/40 p-3 md:p-6">
        <div className="mx-auto overflow-hidden rounded-lg border bg-background shadow-2xl transition-all duration-300" style={{ width, maxWidth: "100%" }}>
          <BuilderPreviewNavigator document={document} pageId={pageId} breakpoint={breakpoint} onPageChange={setPageId} />
        </div>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-900">
        Questa è una bozza autenticata. Non modifica né pubblica il sito pubblico. Prima della pubblicazione devono essere verificati immagini, testi, link, booking, accessibilità e resa mobile.
      </div>
    </>}
  </div>
}
