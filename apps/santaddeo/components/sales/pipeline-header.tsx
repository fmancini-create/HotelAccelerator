"use client"

import { Card, CardContent } from "@/components/ui/card"
import { TrendingUp, Target, Users, Percent } from "lucide-react"

interface PipelineHeaderProps {
  pipelineTotal: number
  pipelineWeighted: number
  dealsActive: number
  conversionRate: number
}

export function PipelineHeader({
  pipelineTotal,
  pipelineWeighted,
  dealsActive,
  conversionRate,
}: PipelineHeaderProps) {
  const formatCurrency = (value: number) => {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`
    }
    return value.toLocaleString("it-IT")
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <Target className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pipeline totale</p>
              <p className="text-xl font-bold">{formatCurrency(pipelineTotal)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pipeline pesata</p>
              <p className="text-xl font-bold">{formatCurrency(pipelineWeighted)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Deal attivi</p>
              <p className="text-xl font-bold">{dealsActive}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100">
              <Percent className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Conversion 90gg</p>
              <p className="text-xl font-bold">{conversionRate}%</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
