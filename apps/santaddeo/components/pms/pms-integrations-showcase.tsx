import { CheckCircle2, Hourglass, Clock } from "lucide-react"
import { groupPmsEntries, type PmsPublicEntry, type PmsPublicGroups } from "@/lib/pms-public-catalog"

interface PmsIntegrationsShowcaseProps {
  /** Voci gia' raggruppate, oppure passare `entries` per raggruppare qui. */
  groups?: PmsPublicGroups
  entries?: PmsPublicEntry[]
  /** Nasconde i gruppi vuoti (default true). */
  hideEmpty?: boolean
}

function Chip({
  name,
  note,
  variant,
}: {
  name: string
  note?: string | null
  variant: "connected" | "certifying" | "upcoming"
}) {
  const styles = {
    connected: "border-emerald-200 bg-emerald-50 text-emerald-800",
    certifying: "border-amber-200 bg-amber-50 text-amber-800",
    upcoming: "border-border bg-muted text-muted-foreground",
  }[variant]
  const Icon = variant === "connected" ? CheckCircle2 : variant === "certifying" ? Hourglass : Clock
  const iconColor =
    variant === "connected" ? "text-emerald-600" : variant === "certifying" ? "text-amber-600" : ""
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${styles}`}
    >
      <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
      {name}
      {note && <span className="text-xs font-normal opacity-80">({note})</span>}
    </span>
  )
}

/**
 * Presentazione (no fetch) dei gestionali integrati, divisi in
 * connessi / in certificazione / prossimi. Riusata da:
 *  - pagina pubblica /integrazioni
 *  - teaser in /features
 *  - dashboard venditori /sales
 */
export function PmsIntegrationsShowcase({ groups, entries, hideEmpty = true }: PmsIntegrationsShowcaseProps) {
  const data = groups ?? groupPmsEntries(entries ?? [])

  const sections = [
    {
      key: "connected" as const,
      title: "Connessi e operativi",
      icon: CheckCircle2,
      iconColor: "text-emerald-600",
      items: data.connected,
      showCount: true,
    },
    {
      key: "certifying" as const,
      title: "In fase di certificazione",
      icon: Hourglass,
      iconColor: "text-amber-600",
      items: data.certifying,
      showCount: false,
    },
    {
      key: "upcoming" as const,
      title: "Prossime integrazioni",
      icon: Clock,
      iconColor: "text-muted-foreground",
      items: data.upcoming,
      showCount: false,
    },
  ]

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        if (hideEmpty && section.items.length === 0) return null
        const SectionIcon = section.icon
        return (
          <div key={section.key}>
            <div className="mb-3 flex items-center gap-2">
              <SectionIcon className={`h-4 w-4 ${section.iconColor}`} />
              <h4 className="text-sm font-semibold">{section.title}</h4>
              {section.showCount && (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  {section.items.length}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {section.items.map((pms) => (
                <Chip key={pms.slug} name={pms.name} note={pms.note} variant={section.key} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
