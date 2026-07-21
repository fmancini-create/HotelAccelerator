import type React from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

interface DashboardShellProps {
  children?: React.ReactNode
}

export function DashboardShell({ children }: DashboardShellProps) {
  return <div className="space-y-4 md:space-y-6">{children}</div>
}

export function DashboardOverviewSkeleton() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 p-3 md:p-6">
              <Skeleton className="h-3 md:h-4 w-16 md:w-24" />
              <Skeleton className="h-3 md:h-4 w-3 md:w-4" />
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              <Skeleton className="h-6 md:h-8 w-16 md:w-20 mb-1" />
              <Skeleton className="h-2 md:h-3 w-12 md:w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Activity cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="p-3 md:p-6">
              <Skeleton className="h-4 md:h-5 w-32 md:w-40" />
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0 space-y-2 md:space-y-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex justify-between">
                  <Skeleton className="h-3 md:h-4 w-24 md:w-32" />
                  <Skeleton className="h-3 md:h-4 w-10 md:w-12" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alert skeleton */}
      <Card>
        <CardHeader className="p-3 md:p-6">
          <Skeleton className="h-5 md:h-6 w-32 md:w-48" />
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          <Skeleton className="h-16 md:h-20 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}

export function DashboardMetricsSkeleton() {
  return (
    <div className="mt-6 space-y-6">
      <div className="flex gap-2 mb-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function AlertsPanelSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56 mt-1" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
