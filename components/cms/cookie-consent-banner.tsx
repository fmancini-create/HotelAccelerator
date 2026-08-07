"use client"

import { useEffect, useState } from "react"

const STORAGE_KEY = "hotelaccelerator-cookie-consent-v1"

type Consent = { analytics: boolean; marketing: boolean }

function publishConsent(consent: Consent) {
  window.dispatchEvent(new CustomEvent("hotelaccelerator:cookie-consent", { detail: consent }))
}

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) {
      setVisible(true)
      publishConsent({ analytics: false, marketing: false })
      return
    }
    try {
      publishConsent(JSON.parse(saved) as Consent)
    } catch {
      window.localStorage.removeItem(STORAGE_KEY)
      setVisible(true)
    }
  }, [])

  function save(consent: Consent) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent))
    publishConsent(consent)
    setVisible(false)
  }

  useEffect(() => {
    const reopen = () => setVisible(true)
    window.addEventListener("hotelaccelerator:open-cookie-preferences", reopen)
    return () => window.removeEventListener("hotelaccelerator:open-cookie-preferences", reopen)
  }, [])

  if (!visible) return null

  return <aside aria-label="Preferenze cookie" className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-3xl rounded-2xl border border-black/10 bg-white p-5 text-neutral-900 shadow-2xl">
    <h2 className="text-lg font-semibold">Preferenze cookie</h2>
    <p className="mt-2 text-sm leading-6 text-neutral-600">Usiamo sempre i cookie tecnici necessari. Cookie analitici e di marketing restano bloccati finché non scegli di accettarli.</p>
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
      <a href="/cookie-policy" className="px-4 py-2 text-center text-sm underline">Leggi la Cookie Policy</a>
      <button type="button" className="rounded-lg border px-4 py-2 text-sm font-medium" onClick={() => save({ analytics: false, marketing: false })}>Rifiuta non necessari</button>
      <button type="button" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white" onClick={() => save({ analytics: true, marketing: true })}>Accetta tutti</button>
    </div>
  </aside>
}

export function CookiePreferencesButton() {
  return <button type="button" className="underline underline-offset-4" onClick={() => window.dispatchEvent(new Event("hotelaccelerator:open-cookie-preferences"))}>Preferenze cookie</button>
}
