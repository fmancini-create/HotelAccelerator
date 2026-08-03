import Link from "next/link"
import { ExternalLink, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function CMSBuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-medium">
            <Eye className="h-4 w-4" />
            Anteprima reale del sito
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Mostra l’ultima bozza salvata con il renderer finale. Non pubblica e non modifica il sito online.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/cms/studio/preview" target="_blank" rel="noopener noreferrer">
            Apri anteprima reale
            <ExternalLink className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
      {children}
    </div>
  )
}
