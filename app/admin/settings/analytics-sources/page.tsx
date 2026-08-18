import { AnalyticsSourcesClient } from "./analytics-sources-client"

export const metadata = {
  title: "Sorgenti statistiche",
  description: "Scegli quali caselle e canali contano nelle statistiche.",
}

export default function AnalyticsSourcesPage() {
  return <AnalyticsSourcesClient />
}
