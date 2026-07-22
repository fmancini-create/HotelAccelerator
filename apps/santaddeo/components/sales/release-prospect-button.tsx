"use client"

import { useState } from "react"
import { toast } from "sonner"
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
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { LogOut, Loader2 } from "lucide-react"

/**
 * Permette al venditore di rilasciare volontariamente un prospect.
 * Dopo il release il prospect torna disponibile a tutti i venditori.
 * Action audit-logged con reason='agent_release' in prospect_assignment_history.
 */
export function ReleaseProspectButton({
  prospectId,
  prospectName,
  onReleased,
}: {
  prospectId: string
  prospectName: string
  onReleased?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleRelease() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/sales/prospects/${prospectId}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Errore durante il rilascio")
      toast.success("Prospect rilasciato. Ora è disponibile ad altri venditori.")
      setOpen(false)
      setNotes("")
      onReleased?.()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-rose-700 hover:text-rose-800 hover:bg-rose-50 border-rose-200"
        onClick={() => setOpen(true)}
      >
        <LogOut className="h-4 w-4 mr-2" />
        Rilascia
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rilasciare {prospectName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Il prospect tornerà disponibile a tutti i venditori. Lo storico
              della tua attività resterà visibile al super-admin ma il prossimo
              agente partirà da zero. Operazione non reversibile (puoi però
              richiederlo di nuovo se ancora libero).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="release-notes" className="text-sm">
              Motivo (opzionale)
            </Label>
            <Textarea
              id="release-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Es. non interessato, contatto irreperibile, fuori target..."
              rows={2}
              className="mt-1"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleRelease()
              }}
              disabled={submitting}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Conferma rilascio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
