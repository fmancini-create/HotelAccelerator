"use client"

import { useState } from "react"

interface FiscalBreakdownHoverProps {
  title: string
  subtitle: string
  departments: Record<string, number>
  documentTypes: Record<string, { count: number; total: number; taxable?: number }>
  total: number
  pmsName?: string | null
  hasDepartmentData?: boolean
  /** Quando true la vista è "IVA esclusa": per tipo documento mostra l'imponibile. */
  netMode?: boolean
}

export function FiscalBreakdownHover({
  title,
  subtitle,
  departments,
  documentTypes,
  total,
  pmsName,
  hasDepartmentData,
  netMode = false,
}: FiscalBreakdownHoverProps) {
  const [activeTab, setActiveTab] = useState<"reparto" | "tipo">("reparto")

  const hasDepartments = Object.keys(departments || {}).length > 0
  const hasDocTypes = Object.keys(documentTypes || {}).length > 0

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b mx-4">
        <button
          onClick={() => setActiveTab("reparto")}
          className={`flex-1 text-xs font-medium py-2 border-b-2 transition-colors ${
            activeTab === "reparto"
              ? "border-emerald-600 text-emerald-700"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Per Reparto
        </button>
        <button
          onClick={() => setActiveTab("tipo")}
          className={`flex-1 text-xs font-medium py-2 border-b-2 transition-colors ${
            activeTab === "tipo"
              ? "border-emerald-600 text-emerald-700"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Per Tipo Documento
        </button>
      </div>

      {/* Content */}
      <div className="px-4 py-3 max-h-64 overflow-y-auto">
        {activeTab === "reparto" && (
          <div className="space-y-1.5">
            {hasDepartments ? (
              <>
                {Object.entries(departments || {})
                  .sort(([, a], [, b]) => b - a)
                  .map(([dept, value]) => (
                    <div key={dept} className="flex justify-between text-xs">
                      <span className="text-muted-foreground truncate mr-3">{dept}</span>
                      <span className={`font-medium tabular-nums whitespace-nowrap ${value < 0 ? "text-red-600" : ""}`}>
                        {value < 0 ? "-" : ""}{"\u20AC"}{Math.abs(value).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
              </>
            ) : (
              <div className="space-y-2 py-2">
                <p className="text-xs text-muted-foreground italic">
                  {hasDepartmentData === false && pmsName
                    ? `Dati non forniti dal PMS (${pmsName})`
                    : "Dati per reparto non disponibili"}
                </p>
                {hasDepartmentData === false && pmsName && (
                  <p className="text-[10px] text-muted-foreground/70">
                    Il gestionale {pmsName} non fornisce il dettaglio per reparto. 
                    Contatta il supporto del PMS per abilitare questa funzionalita.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "tipo" && (
          <div className="space-y-1.5">
            {hasDocTypes ? (
              <>
                {Object.entries(documentTypes || {})
                  .sort(([, a], [, b]) => {
                    const av = netMode && a.taxable != null ? a.taxable : a.total
                    const bv = netMode && b.taxable != null ? b.taxable : b.total
                    return bv - av
                  })
                  .map(([typeName, info]) => {
                    // In vista netto il valore principale è l'imponibile certo;
                    // in vista lordo è il totale documento.
                    const primary = netMode && info.taxable != null ? info.taxable : info.total
                    const secondary = netMode ? info.total : info.taxable
                    const secondaryLabel = netMode ? "lordo" : "impon."
                    return (
                      <div key={typeName} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-muted-foreground truncate">{typeName}</span>
                          <span className="text-[10px] text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded shrink-0">
                            {info.count} doc.
                          </span>
                        </div>
                        <div className="flex flex-col items-end shrink-0 ml-2">
                          <span className={`font-medium tabular-nums ${primary < 0 ? "text-red-600" : ""}`}>
                            {primary < 0 ? "-" : ""}{"\u20AC"}{Math.abs(primary).toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                          </span>
                          {secondary != null && secondary !== primary && (
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {secondaryLabel} {"\u20AC"}{secondary.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </>
            ) : (
              <div className="space-y-2 py-2">
                <p className="text-xs text-muted-foreground italic">
                  {hasDepartmentData === false && pmsName
                    ? `Dati non forniti dal PMS (${pmsName})`
                    : "Dati per tipo documento non disponibili"}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Totale */}
      <div className="flex justify-between items-center text-sm border-t px-4 py-2.5 bg-muted/30">
        <span className="font-semibold">Totale</span>
        <span className="font-bold tabular-nums">
          {"\u20AC"}{total.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
        </span>
      </div>

      {/* Footer */}
      <div className="px-4 pb-3 pt-1">
        <p className="text-[10px] text-muted-foreground">
          {pmsName
            ? `Dati da ${pmsName} (documenti fiscali emessi).`
            : "Dati fiscali dal database normalizzato."}
        </p>
      </div>
    </div>
  )
}
