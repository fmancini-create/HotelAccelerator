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

  const bgColor = type === "success" ? "bg-green-50" : type === "error" ? "bg-red-50" : "bg-blue-50"
  const textColor = type === "success" ? "text-green-800" : type === "error" ? "text-red-800" : "text-blue-800"
  const borderColor = type === "success" ? "border-green-200" : type === "error" ? "border-red-200" : "border-blue-200"

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
