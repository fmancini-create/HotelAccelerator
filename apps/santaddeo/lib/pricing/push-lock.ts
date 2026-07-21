/**
 * Lock di concorrenza per-hotel sul push prezzi verso il PMS.
 *
 * INCIDENT 04/07/2026 (Villa I Barronci): il log mostrava ~30 invocazioni
 * CONCORRENTI di push in 5 minuti (save griglia `pricing-grid` + cron
 * `process-pricing-queue` + retry sweep, tutte sovrapposte). Ognuna pescava e
 * ripushava lo STESSO backlog (~1000 righe) verso Scidoo in parallelo. Scidoo
 * (una sola API key, rate limit per-key) rispondeva 429 "Retry after 30s" a
 * raffica; i retry a 30s facevano sforare il maxDuration -> 504
 * FUNCTION_INVOCATION_TIMEOUT -> le righe venivano marcate failed e ripushate
 * al giro dopo -> tempesta auto-alimentata (508 risposte 504 in una finestra).
 *
 * FIX: serializzare i push per hotel. Solo UN push alla volta per hotel tocca
 * Scidoo; le altre invocazioni escono subito con `deferred=true` e lasciano il
 * backlog al giro successivo (che, essendo il primo ormai finito, lo drena).
 *
 * Il lock vive in Postgres (public.pms_push_locks + RPC atomiche
 * try_acquire_push_lock / release_push_lock) cosi' sopravvive tra invocazioni
 * serverless distinte. Usa SEMPRE il service role (RLS attiva senza policy:
 * solo il service role puo' toccare la tabella).
 */

import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * TTL del lock in secondi. Deve essere >= del tempo massimo che un push puo'
 * impiegare, cosi' un holder che muore senza rilasciare (crash/timeout) libera
 * il lock automaticamente al piu' tardi dopo questo intervallo. Le function di
 * push girano sotto i ~300s -> 360s di margine.
 */
const LOCK_TTL_SECONDS = 360

/** Genera un identificativo univoco per l'holder del lock. */
export function makePushLockHolder(source: string): string {
  return `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Prova ad acquisire il lock di push per l'hotel. Ritorna true se acquisito
 * (via RPC atomica race-free), false se un altro push e' gia' in corso.
 * In caso di errore RPC (es. funzione non ancora deployata) ritorna true in
 * FAIL-OPEN: meglio un push in piu' che bloccare del tutto la propagazione
 * prezzi al PMS.
 */
export async function tryAcquirePushLock(hotelId: string, holder: string): Promise<boolean> {
  try {
    const supabase = await createServiceRoleClient()
    const { data, error } = await supabase.rpc("try_acquire_push_lock", {
      p_hotel: hotelId,
      p_ttl_seconds: LOCK_TTL_SECONDS,
      p_holder: holder,
    })
    if (error) {
      console.error(`[push-lock] try_acquire error (fail-open) hotel=${hotelId}:`, error.message)
      return true
    }
    return data === true
  } catch (e) {
    console.error(`[push-lock] try_acquire threw (fail-open) hotel=${hotelId}:`, e instanceof Error ? e.message : e)
    return true
  }
}

/** Rilascia il lock (solo se ancora detenuto dallo stesso holder). Best-effort. */
export async function releasePushLock(hotelId: string, holder: string): Promise<void> {
  try {
    const supabase = await createServiceRoleClient()
    const { error } = await supabase.rpc("release_push_lock", {
      p_hotel: hotelId,
      p_holder: holder,
    })
    if (error) console.error(`[push-lock] release error hotel=${hotelId}:`, error.message)
  } catch (e) {
    console.error(`[push-lock] release threw hotel=${hotelId}:`, e instanceof Error ? e.message : e)
  }
}
