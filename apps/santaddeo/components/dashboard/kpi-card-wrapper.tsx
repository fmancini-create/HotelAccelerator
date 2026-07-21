"use client"

import { ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Zap, Lock } from "lucide-react"
import Link from "next/link"

interface KpiCardWrapperProps {
  title: string
  children: ReactNode
  isEnabled?: boolean
  hasAccelerator?: boolean
  className?: string
}

export function KpiCardWrapper({
  title,
  children,
  isEnabled = true,
  hasAccelerator = false,
  className = "",
}: KpiCardWrapperProps) {
  // Se il KPI è abilitato o l'utente ha Accelerator, mostra tutto normalmente
  if (isEnabled || hasAccelerator) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    )
  }

  // Se il KPI è disabilitato e non ha Accelerator, mostra il contenuto criptato (blurred)
  return (
    <Card className={`relative ${className}`}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Contenuto blurred */}
        <div className="relative">
          <div className="blur-sm pointer-events-none select-none">{children}</div>

          {/* Overlay CTA */}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-white/70 via-white/80 to-white/90 rounded">
            <Lock className="h-8 w-8 text-amber-500 mb-2" />
            <p className="text-sm font-medium text-foreground mb-3 text-center px-4">
              Attiva Accelerator per visualizzare questo dato
            </p>
            <Link href="/accelerator/activate">
              <Button size="sm" className="gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                Attiva Accelerator
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
