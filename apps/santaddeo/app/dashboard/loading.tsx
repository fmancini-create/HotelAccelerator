import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header skeleton */}
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-32" />
            <div className="flex gap-2">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-10 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Main content skeleton */}
      <main className="flex-1">
        <div className="container mx-auto p-4 md:p-6">
          <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 md:gap-6">
            {/* Left column - Stats cards */}
            <div className="lg:col-span-2 space-y-4 md:space-y-6">
              {/* KPI Cards Grid */}
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

              {/* Activity cards */}
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
            </div>

            {/* Right column - Alerts */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-56 mt-1" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-20 w-full rounded-lg" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
