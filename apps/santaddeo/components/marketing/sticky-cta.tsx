"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Sticky CTA - audit punto 2 (priorita' ALTA).
 *
 * Barra fissa in basso che appare DOPO che l'utente ha scrollato oltre il
 * fold (300px). Visibile su mobile e desktop, dismissable (sessione).
 *
 * Non e' sempre visibile dal primo pixel perche' competerebbe con il CTA
 * principale dell'hero (effetto rumore). Appare quando l'utente sta
 * effettivamente esplorando la pagina.
 */
export function StickyCTA() {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Persistenza sessione: se l'utente l'ha gia' chiusa, non la rimostriamo
    // finche' non riapre la pagina (sessionStorage = una sessione di tab).
    if (typeof window !== "undefined" && sessionStorage.getItem("sticky-cta-dismissed") === "1") {
      setDismissed(true)
      return
    }

    const onScroll = () => {
      // Mostra quando l'utente ha scrollato di almeno 1 fold e nasconde quando
      // l'utente sta arrivando a fondo pagina (per non competere col CTA finale).
      const scrollY = window.scrollY
      const distanceFromBottom =
        document.documentElement.scrollHeight - (scrollY + window.innerHeight)
      setVisible(scrollY > 600 && distanceFromBottom > 400)
    }

    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const handleDismiss = () => {
    setDismissed(true)
    if (typeof window !== "undefined") {
      sessionStorage.setItem("sticky-cta-dismissed", "1")
    }
  }

  if (dismissed || !visible) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-emerald-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur md:px-8"
      role="region"
      aria-label="Inizia gratis SANTADDEO"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">
            Pronto a vedere i tuoi KPI con i benchmark?
          </p>
          <p className="hidden truncate text-xs text-gray-500 sm:block">
            Dashboard gratuita, setup in 2 minuti, nessuna carta richiesta
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/auth/sign-up">
            <Button
              size="sm"
              className="h-10 gap-1.5 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 md:h-11 md:px-5"
            >
              Inizia gratis
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Chiudi banner"
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
