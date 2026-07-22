"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useHotel } from "@/lib/contexts/hotel-context"
import { OnboardingChecklistManager } from "@/components/superadmin/onboarding-checklist-manager"
import { Card, CardContent } from "@/components/ui/card"
import { Building2, Loader2 } from "lucide-react"

export default function AcceleratorOnboardingPage() {
  const { selectedHotel } = useHotel()
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [hasChecklist, setHasChecklist] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!selectedHotel?.id) { setChecking(false); return }
    setChecking(true)
    Promise.all([
      fetch(`/api/onboarding/checklist?hotel_id=${selectedHotel.id}`, { cache: "no-store", credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch("/api/me", { cache: "no-store", credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([cj, rj]) => {
      if (cancelled) return
      const role = rj?.profile?.role
      const sa = role === "super_admin" || role === "superadmin"
      const cl = Boolean(cj?.checklist)
      setHasChecklist(cl)
      setIsSuperAdmin(sa)
      // Tenant senza checklist: rimanda alla dashboard accelerator
      if (!cl && !sa) {
        router.replace("/accelerator")
      } else {
        setChecking(false)
      }
    })
    return () => { cancelled = true }
  }, [selectedHotel?.id, router])

  if (!selectedHotel?.id) {
    return (
      <div className="container mx-auto px-6 py-8">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Seleziona una struttura per visualizzare l&apos;onboarding.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (checking) {
    return (
      <div className="container mx-auto px-6 py-8">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
            <p>Verifica disponibilit&agrave; onboarding...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-6 py-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Onboarding post-firma</h1>
        <p className="text-muted-foreground">
          Lista delle attivit&agrave; richieste dal consulente prima del go-live. Marca ogni
          attivit&agrave; come completata e attendi l&apos;approvazione.
        </p>
      </div>
      <OnboardingChecklistManager hotelId={selectedHotel.id} isSuperAdmin={isSuperAdmin} />
    </div>
  )
}
