import Link from "next/link"
import { MousePointerClick, Settings2 } from "lucide-react"
import { CMSMultipageVisualBuilder } from "@/components/cms/multipage-visual-builder"
import { CMSPublicationControls } from "@/components/cms/publication-controls"
import { Button } from "@/components/ui/button"

export default function CMSVisualBuilderPage() {
  return (
    <div className="cms-multipage-builder space-y-3">
      <style>{`
        .cms-multipage-builder > .space-y-5 > .grid > .space-y-4:last-child {
          display: flex;
          flex-direction: column;
        }
        .cms-multipage-builder > .space-y-5 > .grid > .space-y-4:last-child > *:nth-child(2) {
          order: -1;
          position: sticky;
          top: 1rem;
          z-index: 10;
        }
      `}</style>

      <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Per modificare un contenuto:</strong> clicca direttamente sul titolo, testo, pulsante o immagine nel centro della pagina. Il relativo editor comparirà subito in alto nella colonna destra.
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/cms/studio?setup=1">
            <Settings2 className="mr-2 h-4 w-4" />
            Cambia configurazione
          </Link>
        </Button>
      </div>

      <CMSPublicationControls />
      <CMSMultipageVisualBuilder />
    </div>
  )
}
