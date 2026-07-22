import type React from "react"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function Feature({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="h-10 w-10 text-blue-600 mb-3">{icon}</div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}
