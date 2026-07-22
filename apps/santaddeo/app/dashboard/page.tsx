import { DashboardContent } from "@/components/dashboard/dashboard-content"

export const dynamic = "force-dynamic"

interface DashboardPageProps {
  searchParams: Promise<{ hotel?: string }>
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams
  return <DashboardContent searchParams={params} />
}
