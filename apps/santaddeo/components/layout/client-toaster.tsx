"use client"

import dynamic from "next/dynamic"

// 23/05/2026: il <Toaster> di Sonner causava un hydration mismatch sul body:
// SSR renderizzava un <Suspense> placeholder, il client una <section
// aria-label="Notifications">. Caricarlo via dynamic({ ssr: false }) elimina
// completamente il rendering server-side del toaster lasciando intatta la
// funzionalita' client (tutti i toast.success/error continuano a funzionare).
const Toaster = dynamic(() => import("sonner").then((m) => m.Toaster), {
  ssr: false,
})

export function ClientToaster() {
  return <Toaster position="bottom-right" richColors closeButton />
}
