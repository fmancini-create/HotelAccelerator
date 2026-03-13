import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ShieldAlert } from "lucide-react"
import { headers } from "next/headers"

export default async function DevButtons() {
  // Get hostname from headers (server-side)
  const headersList = await headers()
  const host = headersList.get("x-forwarded-host") || headersList.get("host") || ""
  
  const isDevOrPreview = host.includes("vercel.run") || 
                         host.includes("localhost") || 
                         host.includes("127.0.0.1")

  if (!isDevOrPreview) return null

  return (
    <section className="py-8 px-4 bg-red-950/30 border-t border-red-900/50" aria-label="Development buttons">
      <div className="container mx-auto max-w-3xl">
        <div className="flex items-center gap-3 mb-4">
          <ShieldAlert className="h-5 w-5 text-red-500" />
          <p className="text-sm text-red-400 font-medium">Dev/Preview Mode - Quick Access:</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link href="/admin/dashboard">
            <Button 
              variant="outline" 
              className="border-red-500/50 text-red-400 hover:bg-red-950/50 bg-transparent"
            >
              → Tenant Admin Dashboard
            </Button>
          </Link>
          <Link href="/super-admin">
            <Button 
              variant="outline" 
              className="border-red-500/50 text-red-400 hover:bg-red-950/50 bg-transparent"
            >
              → Platform Super Admin
            </Button>
          </Link>
        </div>
      </div>
    </section>
  )
}
