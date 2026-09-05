"use client"

import { useEffect, useState } from "react"
import { Clock3 } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

function clearPromptFromUrl() {
  const url = new URL(window.location.href)
  url.searchParams.delete("time_clock_prompt")
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  )
}

/**
 * Promemoria desktop post-login. Il server/client auth gate aggiunge il query
 * marker soltanto dopo aver verificato obbligo HR e assenza di check-in aperto.
 * Il dialog resta volutamente non bloccante: il desktop e' una superficie di
 * lavoro completa, mentre il gate obbligatorio rimane riservato al mobile.
 */
export function DesktopTimeClockPrompt() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("time_clock_prompt") === "1") setOpen(true)
  }, [])

  function dismiss() {
    clearPromptFromUrl()
    setOpen(false)
  }

  function goToTimeClock() {
    clearPromptFromUrl()
    window.location.assign("/admin/time-clock")
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setOpen(true)
        else dismiss()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock3 className="h-5 w-5" aria-hidden />
            Devi timbrare l&apos;ingresso?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Per il tuo profilo la timbratura è obbligatoria e non risulta un check-in aperto.
            Vuoi registrare l&apos;entrata adesso?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>No, continua</AlertDialogCancel>
          <AlertDialogAction onClick={goToTimeClock}>Timbra ora</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
