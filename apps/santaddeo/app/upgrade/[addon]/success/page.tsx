"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Check, PartyPopper, ArrowRight, Loader2 } from "lucide-react"
import confetti from "canvas-confetti"

interface PublicModule {
  name: string
  features: string[]
}

export default function AddonUpgradeSuccessPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = useParams<{ addon: string }>()
  const sessionId = searchParams.get("session_id")
  const [loading, setLoading] = useState(true)
  const [product, setProduct] = useState<PublicModule | null>(null)

  const slug = String(params?.addon || "")
  const addonType = slug.replace(/-/g, "_")

  useEffect(() => {
    let cancelled = false
    async function loadProduct() {
      try {
        const res = await fetch(`/api/catalog/${addonType}`)
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) setProduct(data.module as PublicModule)
        }
      } catch (err) {
        console.error("[v0] Error loading module:", err)
      }
    }
    loadProduct()
    return () => {
      cancelled = true
    }
  }, [addonType])

  useEffect(() => {
    async function verifyPayment() {
      if (!sessionId) {
        setLoading(false)
        return
      }
      try {
        const res = await fetch(`/api/addon/verify?session_id=${sessionId}`)
        const data = await res.json()
        if (data.verified) {
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } })
        }
      } catch {
        // Webhook handles the real activation; show success anyway.
      } finally {
        setLoading(false)
      }
    }
    verifyPayment()
  }, [sessionId])

  const name = product?.name || "Modulo"

  return (
    <div className="container mx-auto max-w-lg px-4 py-16">
      <Card className="shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            {loading ? (
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            ) : (
              <PartyPopper className="h-10 w-10 text-primary" />
            )}
          </div>
          <CardTitle className="text-3xl">{loading ? "Elaborazione..." : `${name} attivo!`}</CardTitle>
          <CardDescription className="text-base">
            {loading
              ? "Stiamo attivando il tuo modulo..."
              : `Il modulo ${name} è stato attivato con successo per la tua struttura.`}
          </CardDescription>
        </CardHeader>

        {!loading && product && (
          <CardContent>
            <ul className="space-y-2 rounded-lg bg-muted/50 p-4">
              {product.features.slice(0, 3).map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        )}

        {!loading && (
          <CardFooter className="flex-col gap-3 sm:flex-row sm:justify-center">
            <Button onClick={() => router.push(`/accelerator/${slug}`)} className="w-full gap-2 sm:w-auto">
              Vai al modulo
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button onClick={() => router.push("/dashboard")} variant="outline" className="w-full gap-2 sm:w-auto">
              Torna alla Dashboard
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  )
}
