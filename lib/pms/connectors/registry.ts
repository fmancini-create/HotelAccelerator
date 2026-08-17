/**
 * Il registro dei connettori PMS.
 *
 * E' l'UNICO punto del sistema in cui i nomi dei fornitori compaiono. Aggiungere
 * un PMS = scrivere `connectors/<nome>.ts` e aggiungere una riga qui; unione,
 * sincronizzazione, rotta e pagina non cambiano.
 *
 * PERCHE' UN ERRORE E NON UN RIPIEGO SILENZIOSO: se `pms_type` contiene un
 * valore che non conosciamo (un fornitore configurato a mano, un errore di
 * battitura), la tentazione sarebbe usare il fornitore di prova. Sarebbe il
 * comportamento peggiore: la struttura ha credenziali vere, e vedrebbe scorrere
 * dati finti credendoli i propri. Meglio fermarsi dicendo quale valore non e'
 * riconosciuto e quali sono ammessi.
 */

import type { PmsCredentials, PmsProvider } from "../provider"
import { makeScidooProvider, SCIDOO_BASE_URL_PREDEFINITO, SCIDOO_SLUG } from "./scidoo"

type Fabbrica = (creds: PmsCredentials) => PmsProvider

type VoceRegistro = {
  /** Nome leggibile del fornitore, per le schermate di configurazione. */
  etichetta: string
  /** Indirizzo da usare quando la configurazione non ne dichiara uno. */
  baseUrlPredefinito: string
  crea: Fabbrica
}

const REGISTRO: Record<string, VoceRegistro> = {
  [SCIDOO_SLUG]: {
    etichetta: "Scidoo",
    baseUrlPredefinito: SCIDOO_BASE_URL_PREDEFINITO,
    crea: makeScidooProvider,
  },
}

/** I fornitori supportati, per mostrarli in configurazione senza elencarli a mano. */
export function connettoriDisponibili(): Array<{ slug: string; etichetta: string }> {
  return Object.entries(REGISTRO).map(([slug, v]) => ({ slug, etichetta: v.etichetta }))
}

export function connettoreEsiste(slug: string | null | undefined): boolean {
  return Boolean(slug && slug in REGISTRO)
}

/** Indirizzo predefinito del fornitore, se lo conosciamo. */
export function baseUrlPredefinito(slug: string): string | null {
  return REGISTRO[slug]?.baseUrlPredefinito ?? null
}

/**
 * Costruisce il connettore per il tipo salvato sulla struttura.
 * Lancia se il tipo non e' riconosciuto: vedi la nota in testa al file.
 */
export function creaConnettore(slug: string, creds: PmsCredentials): PmsProvider {
  const voce = REGISTRO[slug]
  if (!voce) {
    const ammessi = Object.keys(REGISTRO).join(", ") || "nessuno"
    throw new Error(
      `Tipo di PMS non riconosciuto ("${slug}"). Connettori disponibili: ${ammessi}. ` +
        `La sincronizzazione si ferma per non mostrare dati di prova a una struttura che ha credenziali vere.`,
    )
  }
  return voce.crea({ ...creds, baseUrl: creds.baseUrl || voce.baseUrlPredefinito })
}
