import { Sparkles, Lock } from "lucide-react"

/**
 * Banner mostrato in cima alle pagine demo delle funzioni "Accelerator".
 *
 * Nel prodotto REALE tutte le voci del menu Accelerator (Obiettivi, Pricing,
 * Produzione per Canali, Disponibilita', Guard, Log Invio Prezzi, Insight AI,
 * Analytics, Area Revenue Manager) sono dietro il gating dell'abbonamento
 * (vedi components/dashboard/app-header.tsx -> handleAcceleratorClick).
 * In demo le mostriamo per far vedere il valore, ma chiariamo che sono
 * attivabili solo con il piano a pagamento.
 */
export function AcceleratorPaidBanner({ feature }: { feature: string }) {
  return (
    <div className="border-b border-primary/20 bg-primary/5">
      <div className="container flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
          <Sparkles className="h-3 w-3" />
          Accelerator
        </span>
        <span className="inline-flex items-center gap-1.5 text-primary">
          <Lock className="h-3.5 w-3.5" />
          <span className="font-medium">{feature}</span>
        </span>
        <span className="text-muted-foreground">
          {"e' una funzione Accelerator: disponibile attivando il piano a pagamento."}
        </span>
      </div>
    </div>
  )
}
