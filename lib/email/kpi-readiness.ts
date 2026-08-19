/**
 * Decide se il KPI "Non lette" può essere pubblicato, guardando l'ETA' del
 * segnalibro di riconciliazione e non solo la sua esistenza.
 *
 * Perche' esiste questa funzione (pura, quindi verificabile):
 *
 * Prima `/api/kpi/email` faceva `Boolean(gmail_state_reconciled_at)`: bastava
 * che la riparazione fosse riuscita UNA VOLTA, anche mesi prima, e il KPI
 * continuava a pubblicare il numero come se fosse allineato a Gmail. Se la
 * riparazione si rompeva restava tutto verde a schermo.
 *
 * Distinguere i tre casi conta perche' l'interfaccia diceva sempre
 * "Allineamento stato Gmail in corso": vero alla prima passata, FALSO quando la
 * riparazione e' ferma da settimane. Nascondere il numero dietro un messaggio
 * che annuncia un lavoro che non sta avvenendo e' una conferma falsa.
 */

/** Ogni quanto il sync riesegue la passata completa (`incremental-sync`: 1 ora). */
export const FULL_RECONCILE_INTERVAL_MS = 60 * 60 * 1000

/**
 * Oltre quanto un segnalibro e' considerato vecchio.
 *
 * Ricavato dalla cadenza reale, non scelto a caso: la passata completa gira ogni
 * ora e il cron ogni 5 minuti, quindi 6 ore = 6 tentativi mancati. Abbastanza
 * larga da non far lampeggiare il KPI per un singolo timeout (come quello visto
 * il 16/08), abbastanza stretta da non spacciare per aggiornato un numero fermo
 * da giorni.
 */
export const RECONCILE_STALE_AFTER_MS = 6 * FULL_RECONCILE_INTERVAL_MS

export type KpiReadinessStatus =
  /** Tutte le caselle sane hanno riconciliato di recente: il numero e' pubblicabile. */
  | "gmail_state_ready"
  /** Almeno una casella sana non ha MAI riconciliato: prima passata in corso davvero. */
  | "reconciling"
  /** Ha riconciliato in passato, ma il segnalibro e' troppo vecchio: qualcosa e' fermo. */
  | "stale"

export interface ChannelReconcileState {
  gmail_state_reconciled_at?: string | null
  oauth_reconnect_required?: boolean | null
}

export interface KpiReadiness {
  status: KpiReadinessStatus
  /** Vero solo per `gmail_state_ready`: unica condizione che pubblica il numero. */
  ready: boolean
  /** Caselle sane che non hanno mai riconciliato. */
  neverReconciled: number
  /** Caselle sane il cui segnalibro e' oltre la soglia. */
  staleReconciled: number
  /** Eta' del segnalibro piu' vecchio fra le caselle sane, in minuti. */
  oldestReconcileAgeMinutes: number | null
}

export function evaluateKpiReadiness(
  channels: ChannelReconcileState[],
  now: number = Date.now(),
  staleAfterMs: number = RECONCILE_STALE_AFTER_MS,
): KpiReadiness {
  // Una casella con l'autorizzazione revocata non puo' piu' sincronizzare, quindi
  // non deve bloccare il KPI dell'intera struttura: la si esclude, come faceva
  // gia' la rotta.
  const sane = channels.filter((c) => c.oauth_reconnect_required !== true)

  let neverReconciled = 0
  let staleReconciled = 0
  let oldestAgeMs: number | null = null

  for (const c of sane) {
    const grezzo = c.gmail_state_reconciled_at
    const istante = grezzo ? new Date(grezzo).getTime() : Number.NaN

    // Una data illeggibile vale come "mai": meglio dichiarare non pronto che
    // pubblicare un numero appoggiato a un valore che non sappiamo leggere.
    if (!Number.isFinite(istante)) {
      neverReconciled += 1
      continue
    }

    const eta = now - istante
    if (oldestAgeMs === null || eta > oldestAgeMs) oldestAgeMs = eta
    if (eta > staleAfterMs) staleReconciled += 1
  }

  const status: KpiReadinessStatus =
    sane.length === 0 || neverReconciled > 0 ? "reconciling" : staleReconciled > 0 ? "stale" : "gmail_state_ready"

  return {
    status,
    ready: status === "gmail_state_ready",
    neverReconciled,
    staleReconciled,
    oldestReconcileAgeMinutes: oldestAgeMs === null ? null : Math.round(oldestAgeMs / 60000),
  }
}
