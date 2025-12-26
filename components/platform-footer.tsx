import { Building2 } from "lucide-react"

export function PlatformFooter() {
  return (
    <footer className="border-t border-border/40 bg-muted/30 py-10 mt-auto">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center gap-8">
          {/* Logo Hotel Accelerator */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="h-5 w-5" />
            </div>
            <span className="text-xl font-semibold tracking-tight">
              Hotel<span className="text-primary">Accelerator</span>
            </span>
          </div>

          {/* Separatore */}
          <div className="w-24 h-px bg-border/60" />

          {/* 4Bid info */}
          <div className="flex flex-col items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-3">
              <img src="/images/4bid-logo.png" alt="4Bid S.r.l." width={40} height={40} className="opacity-80" />
              <p className="font-medium text-foreground/80">
                Un prodotto di <span className="text-primary">4Bid S.r.l.</span>
              </p>
            </div>

            {/* Dati aziendali */}
            <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 text-xs text-center">
              <span>Sede legale: Via Sorripa, 10 - 50026 San Casciano in Val di Pesa (FI)</span>
              <span className="hidden md:inline text-border">|</span>
              <span>P. IVA: 06241710489</span>
            </div>

            {/* Copyright */}
            <p className="text-xs text-muted-foreground/70">
              © {new Date().getFullYear()} 4Bid S.r.l. – Tutti i diritti riservati
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
