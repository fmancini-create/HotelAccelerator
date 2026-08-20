"use client"

/**
 * Pulsante "Entra nella struttura" per il super admin.
 *
 * Perche' esiste
 * --------------
 * Nell'area /super-admin il pulsante "Impersona" era FINTO: un console.log e un
 * alert "Funzionalita' in arrivo". Il meccanismo per cambiare struttura era
 * invece gia' completo lato server (POST /api/platform/switch-tenant, che per un
 * super_admin accetta qualunque property esistente): mancava solo il collegamento.
 *
 * Due scelte da non ribaltare senza motivo:
 *
 * 1. NON si promette la "sola lettura".
 *    Il vecchio alert diceva "modalita' SOLA LETTURA". La rotta che cambia
 *    struttura NON limita nulla: scrive il cookie del contesto attivo e da'
 *    accesso pieno. Ripetere quella frase sarebbe la bugia piu' rischiosa
 *    possibile, perche' chi la legge crede di non poter combinare guai e invece
 *    ogni azione e' reale. Il testo dice quindi "Entra" e l'avviso dice che le
 *    azioni sono reali.
 *
 * 2. L'esito si VEDE.
 *    Il layout /super-admin non monta nessun <Toaster>: un toast qui sarebbe
 *    muto. L'errore viene quindi scritto in pagina, con role="alert". Se il
 *    cambio fallisse in silenzio, il super admin resterebbe sulla stessa
 *    schermata convinto di aver cambiato contesto.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"

type Props = {
  propertyId: string
  propertyName: string
  /** Etichetta del pulsante; per default "Entra". */
  label?: string
  variant?: "outline" | "default" | "ghost"
  size?: "sm" | "default"
  className?: string
}

export function EnterTenantButton({
  propertyId,
  propertyName,
  label = "Entra",
  variant = "outline",
  size = "sm",
  className,
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleEnter = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/platform/switch-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ propertyId }),
      })

      if (!res.ok) {
        // Il corpo puo' non essere JSON (es. una pagina di errore): in quel caso
        // non si deve perdere l'esito, quindi si ripiega sul codice HTTP.
        let detail = `errore ${res.status}`
        try {
          const body = await res.json()
          if (body?.error) detail = String(body.error)
        } catch {
          /* corpo non leggibile: resta il codice HTTP */
        }
        setError(`Non sono riuscito a entrare in ${propertyName}: ${detail}`)
        return
      }

      // Il contesto e' cambiato: si va nell'area operativa, la sola che legge
      // la struttura attiva (le pagine /super-admin lavorano su tutti i tenant).
      router.push("/admin")
    } catch (err) {
      setError(`Non sono riuscito a entrare in ${propertyName}: rete non raggiungibile`)
      console.error("[v0] switch-tenant fallito", err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={className}>
      <Button
        onClick={handleEnter}
        variant={variant}
        size={size}
        disabled={busy}
        aria-label={`Entra nella struttura ${propertyName}`}
      >
        <LogIn className="w-4 h-4 mr-2" />
        {busy ? "Apertura..." : label}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  )
}
