"use client"

/**
 * Contesto di VISUALIZZAZIONE netto/lordo IVA per le pagine KPI.
 *
 * Comportamento (deciso con l'utente, 21/06/2026):
 *  - E' una preferenza PERSONALE di sola vista: NON modifica l'impostazione
 *    del tenant (`hotels.revenue_vat_mode`).
 *  - Parte dal DEFAULT della struttura; se l'utente sceglie un override viene
 *    ricordato nel browser (localStorage), per-hotel.
 *  - L'override viaggia verso le API come query param `vatView=gross|net`.
 *    Se l'utente non ha scelto nulla, NON si invia il param (le route usano il
 *    default certo del tenant) -> retrocompatibile.
 *
 * NB: il cambio struttura nell'header fa una navigazione full-page, quindi il
 * provider viene rimontato e il default del nuovo hotel ricaricato.
 */

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"
import type { VatView, VatMode } from "@/lib/utils/vat-display"

interface VatViewContextValue {
  /** Override scelto dall'utente (null = nessun override, usa default tenant). */
  vatView: VatView | null
  /** Vista effettiva mostrata (override se presente, altrimenti default tenant). */
  effectiveView: VatView
  /** Default certo della struttura, per etichette/UX. */
  tenantDefault: VatView
  /** True quando il default del tenant e' stato caricato. */
  ready: boolean
  /** Imposta (o azzera) l'override e lo persiste nel browser. */
  setVatView: (view: VatView | null) => void
}

const VatViewContext = createContext<VatViewContextValue | null>(null)

const STORAGE_PREFIX = "santaddeo:vat-view:"

function modeToView(mode: VatMode | string | null | undefined): VatView {
  return mode === "excluded" ? "net" : "gross"
}

export function VatViewProvider({ children }: { children: ReactNode }) {
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [tenantDefault, setTenantDefault] = useState<VatView>("gross")
  const [vatView, setVatViewState] = useState<VatView | null>(null)
  const [ready, setReady] = useState(false)

  // Carica il default della struttura + eventuale override salvato nel browser.
  useEffect(() => {
    let cancelled = false
    fetch("/api/ui/selected-hotel", { cache: "no-store", credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.hotel) {
          if (!cancelled) setReady(true)
          return
        }
        const id: string = j.hotel.id
        const def = modeToView(j.hotel.revenue_vat_mode)
        setHotelId(id)
        setTenantDefault(def)
        try {
          const saved = window.localStorage.getItem(STORAGE_PREFIX + id)
          if (saved === "gross" || saved === "net") setVatViewState(saved)
          else setVatViewState(null)
        } catch {
          /* localStorage non disponibile: nessun override */
        }
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const setVatView = useCallback(
    (view: VatView | null) => {
      setVatViewState(view)
      if (!hotelId) return
      try {
        if (view === null) window.localStorage.removeItem(STORAGE_PREFIX + hotelId)
        else window.localStorage.setItem(STORAGE_PREFIX + hotelId, view)
      } catch {
        /* persistenza best-effort */
      }
    },
    [hotelId],
  )

  const effectiveView: VatView = vatView ?? tenantDefault

  return (
    <VatViewContext.Provider value={{ vatView, effectiveView, tenantDefault, ready, setVatView }}>
      {children}
    </VatViewContext.Provider>
  )
}

/**
 * Hook per leggere la preferenza IVA. Sicuro anche fuori dal provider:
 * ritorna un default neutro (nessun override) cosi' le pagine non si rompono.
 */
export function useVatView(): VatViewContextValue {
  const ctx = useContext(VatViewContext)
  if (!ctx) {
    return {
      vatView: null,
      effectiveView: "gross",
      tenantDefault: "gross",
      ready: false,
      setVatView: () => {},
    }
  }
  return ctx
}

/**
 * Helper: ritorna il pezzo di query string da appendere alle fetch KPI.
 * Stringa vuota se non c'e' override (retrocompatibile).
 */
export function vatViewQuery(vatView: VatView | null): string {
  return vatView ? `&vatView=${vatView}` : ""
}
