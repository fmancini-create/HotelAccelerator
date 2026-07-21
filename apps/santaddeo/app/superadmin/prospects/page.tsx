import Link from "next/link"
import { ProspectsManager } from "@/components/superadmin/prospects-manager"
import { AssignmentRequestsLink } from "@/components/superadmin/assignment-requests-link"
import { Button } from "@/components/ui/button"
import { CalendarClock } from "lucide-react"

export const metadata = {
  title: "Gestione Prospect | Santaddeo",
  description: "Database strutture ricettive italiane per attività commerciale",
}

export default function ProspectsPage() {
  return (
    <div className="container py-6 max-w-[1600px]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Database Prospect</h1>
          <p className="text-muted-foreground">
            Gestisci e assegna le strutture ricettive ai venditori
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/superadmin/prospects/assignments">
              <CalendarClock className="h-4 w-4 mr-2" />
              Assegnazioni attive
            </Link>
          </Button>
          <AssignmentRequestsLink />
        </div>
      </div>

      <ProspectsManager />
    </div>
  )
}
