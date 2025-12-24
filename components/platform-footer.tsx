export function PlatformFooter() {
  return (
    <footer className="border-t border-border/40 bg-muted/30 py-8 mt-auto">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-muted-foreground">
          {/* Logo e info azienda */}
          <div className="flex items-center gap-4">
            <img src="/images/4bid-logo-small.png" alt="4Bid S.r.l." width={48} height={48} className="opacity-70" />
            <div className="text-left">
              <p className="font-medium text-foreground/80">HotelAccelerator è un progetto di 4Bid S.r.l.</p>
              <p className="text-xs mt-1">Sede legale: Via Sorripa, 10 - 50026 - San Casciano in Val di Pesa (FI)</p>
            </div>
          </div>

          {/* Info legali */}
          <div className="flex flex-col md:flex-row items-center gap-4 text-xs">
            <span>P. IVA: 06241710489</span>
            <span className="hidden md:inline">•</span>
            <span>© 2025 – Tutti i diritti riservati</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
