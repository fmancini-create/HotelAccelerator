"use client"

import dynamic from "next/dynamic"

/**
 * Contenitore degli avvisi (Sonner) per l'area admin.
 *
 * Perche' serviva: `sonner` era installato e diverse pagine (billing,
 * crm/settings, tracking, site-legal) chiamavano toast.success/error, ma il
 * <Toaster> NON era montato da nessuna parte: quegli avvisi erano INVISIBILI.
 * Un'operazione che riesce o fallisce senza dirlo e' peggio di nessun avviso,
 * perche' l'utente ripete il comando.
 *
 * Perche' via dynamic({ ssr: false }): nel monorepo lo stesso componente
 * causava un disallineamento di idratazione (il server rendeva un placeholder,
 * il client una <section aria-label="Notifications">). Lo schema e' gia'
 * collaudato in apps/santaddeo: lo riuso invece di reinventarlo.
 */
const Toaster = dynamic(() => import("sonner").then((m) => m.Toaster), {
  ssr: false,
})

export function ClientToaster() {
  return <Toaster position="bottom-right" richColors closeButton />
}
