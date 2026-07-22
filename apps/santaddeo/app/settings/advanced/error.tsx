"use client"

/**
 * Error boundary diagnostico per /settings/advanced (BookingKpiTab,
 * AdvancedIntegrationsForm, ecc.).
 *
 * Vedi /settings/pms/error.tsx per la motivazione completa.
 */

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RefreshCw, Copy, ChevronDown, ChevronRight } from "lucide-react"

export default function SettingsAdvancedError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [showStack, setShowStack] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (error) {
      console.error("[v0] /settings/advanced error:", error.message || error)
      console.error("[v0] /settings/advanced stack:", error.stack)
      console.error("[v0] /settings/advanced digest:", error.digest)
    }
  }, [error])

  const diagnosticText =
    `Pagina: /settings/advanced\n` +
    `Nome: ${error.name || "Error"}\n` +
    `Messaggio: ${error.message || "(nessun messaggio)"}\n` +
    `Digest: ${error.digest || "(nessuno)"}\n\n` +
    `Stack trace:\n${error.stack || "(stack non disponibile)"}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch (e) {
      console.error("[v0] copy failed:", e)
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-white rounded-xl border shadow-sm p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="h-12 w-12 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-6 w-6 text-orange-500" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900 mb-1">Errore nelle Impostazioni Avanzate</h1>
            <p className="text-sm text-muted-foreground">
              Si e&apos; verificato un errore imprevisto in <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">/settings/advanced</code>.
              Copia i dettagli qui sotto e incollali nella chat per diagnosticare il problema.
            </p>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-red-700">Messaggio</span>
            {error.digest && (
              <span className="text-xs text-red-600 font-mono">digest: {error.digest}</span>
            )}
          </div>
          <p className="text-sm font-mono text-red-900 break-all">
            {error.message || "(nessun messaggio)"}
          </p>
          {error.name && error.name !== "Error" && (
            <p className="text-xs text-red-700 mt-2">Tipo: <span className="font-mono">{error.name}</span></p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowStack((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-gray-700 hover:text-gray-900 mb-2"
        >
          {showStack ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {showStack ? "Nascondi stack trace" : "Mostra stack trace"}
        </button>

        {showStack && (
          <pre className="bg-gray-900 text-gray-100 text-xs rounded-lg p-3 overflow-x-auto max-h-64 mb-4 whitespace-pre-wrap break-all">
            {error.stack || "(stack non disponibile)"}
          </pre>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button onClick={reset}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Riprova
          </Button>
          <Button variant="outline" onClick={handleCopy}>
            <Copy className="h-4 w-4 mr-2" />
            {copied ? "Copiato!" : "Copia dettagli"}
          </Button>
          <Button variant="ghost" onClick={() => (window.location.href = "/settings")}>
            Torna a Settings
          </Button>
        </div>
      </div>
    </div>
  )
}
