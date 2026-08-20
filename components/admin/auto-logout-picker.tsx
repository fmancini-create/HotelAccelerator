"use client"

import { Clock } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  TEMPI_DISCONNESSIONE,
  etichettaTempo,
  type GruppoConTempo,
  risolviTempoDisconnessione,
} from "@/lib/auth/auto-logout"

/**
 * Scelta del tempo di disconnessione automatica per inattivita'.
 *
 * Serve identica in due pagine (permessi dell'utente e permessi del gruppo):
 * sta qui una volta sola, come `AreaPermissionsMatrix`, perche' due copie di un
 * elenco di tempi sono due elenchi che prima o poi divergono.
 */

/** Valore speciale dell'elenco: `null` non e' rappresentabile in un <select>. */
const EREDITA = "eredita"

interface Props {
  /** Minuti scelti su questa entita'; `null` = non deciso qui. */
  valore: number | null
  onChange: (valore: number | null) => void
  disabled?: boolean
  /**
   * Modalita' d'uso. Cambia solo le PAROLE, non la logica: su un gruppo "non
   * deciso" significa "il gruppo non impone nulla", su una persona significa
   * "segui i gruppi". Chiamarle allo stesso modo confonderebbe chi imposta.
   */
  ambito: "utente" | "gruppo"
  /**
   * Solo per `ambito="utente"`: i gruppi della persona con il loro tempo.
   * Serve a mostrare cosa vale DAVVERO quando la casella e' su "segui i
   * gruppi": senza questo, chi imposta crede che non ci sia nessun limite.
   */
  gruppi?: GruppoConTempo[]
}

export function AutoLogoutPicker({ valore, onChange, disabled, ambito, gruppi }: Props) {
  const risolto = risolviTempoDisconnessione({ valoreUtente: valore, gruppi })

  // Cosa accade davvero, detto in una frase. Il caso importante e' il terzo:
  // la casella dice "segui i gruppi" e un gruppo impone un tempo — se non lo
  // dicessimo, la pagina sembrerebbe dire "nessuna disconnessione".
  let spiegazione: string
  if (ambito === "gruppo") {
    spiegazione =
      valore === null
        ? "Il gruppo non impone un tempo: per i suoi membri vale quello scelto sulla persona o su un altro gruppo."
        : `I membri di questo gruppo vengono disconnessi dopo ${etichettaTempo(valore)} di inattivita', a meno che sulla loro scheda non sia scelto un tempo diverso.`
  } else if (risolto.origine === "utente") {
    spiegazione = `Questa persona viene disconnessa dopo ${etichettaTempo(risolto.minuti as number)} di inattivita'. La scelta fatta qui ha la precedenza sui gruppi.`
  } else if (risolto.origine === "gruppo") {
    spiegazione = `In vigore: ${etichettaTempo(risolto.minuti as number)}, dal gruppo "${risolto.nomeGruppo}". Fra piu' gruppi vale il tempo piu' breve; scegli un tempo qui sopra per fare un'eccezione per questa persona.`
  } else {
    spiegazione =
      "Nessuna disconnessione automatica: la sessione resta aperta. Ne' questa persona ne' i suoi gruppi hanno un tempo impostato."
  }

  return (
    <div className="bg-card rounded-xl border p-6">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Clock className="size-5 text-foreground" aria-hidden="true" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div>
            <h2 className="font-medium">Disconnessione automatica</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {
                "Chiude la sessione dopo un periodo senza attivita', per proteggere un computer lasciato aperto. Prima di chiudere compare un avviso con il conto alla rovescia."
              }
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:max-w-xs">
            <Label htmlFor="auto-logout">Tempo di inattività</Label>
            <Select
              value={valore === null ? EREDITA : String(valore)}
              onValueChange={(v) => onChange(v === EREDITA ? null : Number(v))}
              disabled={disabled}
            >
              <SelectTrigger id="auto-logout" aria-describedby="auto-logout-effetto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EREDITA}>
                  {ambito === "gruppo" ? "Nessun tempo imposto dal gruppo" : "Segui i gruppi"}
                </SelectItem>
                {TEMPI_DISCONNESSIONE.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {etichettaTempo(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p id="auto-logout-effetto" className="text-sm leading-relaxed text-muted-foreground">
            {spiegazione}
          </p>
        </div>
      </div>
    </div>
  )
}
