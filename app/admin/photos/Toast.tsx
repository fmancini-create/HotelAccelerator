"use client"

import { useEffect } from "react"
import { CheckCircle, XCircle, Loader2 } from "lucide-react"

interface ToastProps {
  message: string
  type: "success" | "error" | "loading"
  onClose: () => void
}

export function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    if (type !== "loading") {
      const timer = setTimeout(onClose, 5000)
      return () => clearTimeout(timer)
    }
  }, [type, onClose])

  const bgColor = type === "success" ? "bg-ha-success-soft" : type === "error" ? "bg-ha-error-soft" : "bg-ha-info-soft"
  const textColor = type === "success" ? "text-ha-success-soft-foreground" : type === "error" ? "text-ha-error-soft-foreground" : "text-ha-info-soft-foreground"
  const borderColor = type === "success" ? "border-ha-success-soft" : type === "error" ? "border-ha-error-soft" : "border-ha-info-soft"

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg border ${bgColor} ${textColor} ${borderColor} shadow-lg`}
    >
      {type === "success" && <CheckCircle className="h-5 w-5" />}
      {type === "error" && <XCircle className="h-5 w-5" />}
      {type === "loading" && <Loader2 className="h-5 w-5 animate-spin" />}
      <p className="text-sm font-medium">{message}</p>
      {type !== "loading" && (
        <button onClick={onClose} className="ml-2 hover:opacity-70">
          ×
        </button>
      )}
    </div>
  )
}
