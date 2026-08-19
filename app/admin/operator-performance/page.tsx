import type { Metadata } from "next"

import { OperatorPerformanceClient } from "./operator-performance-client"

export const metadata: Metadata = {
  title: "Performance operatori",
  description: "Quante risposte e con che attesa, per operatore",
}

export default function Page() {
  return <OperatorPerformanceClient />
}
