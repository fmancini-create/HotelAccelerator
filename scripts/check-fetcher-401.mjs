/**
 * Prova di NON-REGRESSIONE sul difetto di /admin/billing.
 *
 * Interroga la ROTTA VERA (non una replica) e confronta il vecchio fetcher
 * con quello nuovo, riproducendo cio' che fa SWR:
 *   - il fetcher risolve  -> data = valore risolto, error = undefined
 *   - il fetcher lancia   -> data = undefined,      error = eccezione
 * Poi esegue lo stesso accesso che faceva schiantare la pagina.
 *
 * Auto-discriminante: verifica il caso ROSSO (401 -> avviso) e il caso VERDE
 * (200 -> dati usabili). Senza il verde non saprei distinguere una correzione
 * che funziona da una che rompe tutto.
 */
// Con la sessione: host localhost -> il bypass di sviluppo autentica.
const BASE = "http://localhost:3000"
// Senza sessione: serve un host NON-localhost, perche' getDevBypass legge
// l'intestazione `host`. Non si puo' forzare con un header: `Host` e' vietato
// in fetch e viene ignorato in silenzio (misura falsamente verde).
// `localtest.me` e' un nome pubblico che risolve all'indirizzo locale, quindi
// la richiesta arriva DAVVERO alla rotta vera con un host esterno.
const BASE_ESTERNO = "http://localtest.me:3000"

class HttpError extends Error {
  constructor(status, serverMessage) {
    super(serverMessage || `HTTP ${status}`)
    this.name = "HttpError"
    this.status = status
    this.serverMessage = serverMessage
  }
}

const vecchio = (url) => fetch(url).then((r) => r.json())
const nuovo = async (url) => {
  const res = await fetch(url)
  if (!res.ok) {
    let serverMessage
    if (res.status < 500) {
      try {
        const b = await res.json()
        if (typeof b?.error === "string" && b.error.trim()) serverMessage = b.error
      } catch {}
    }
    throw new HttpError(res.status, serverMessage)
  }
  return res.json()
}

/** Riproduce il ciclo di SWR: cosa finisce in `data` e cosa in `error`. */
async function comeSwr(fetcher, url) {
  try {
    return { data: await fetcher(url), error: undefined }
  } catch (e) {
    return { data: undefined, error: e }
  }
}

/** La riga che mandava in errore la pagina. */
function renderizza({ data, error }) {
  if (error) {
    // Solo 401 = sessione scaduta. Per gli altri vince il messaggio del
    // server, che dice all'utente cosa fare davvero.
    if (error instanceof HttpError && error.status === 401) return "AVVISO: sessione scaduta"
    const msg = error instanceof HttpError && error.serverMessage
    return msg ? `AVVISO(server): ${msg}` : "AVVISO: errore di caricamento"
  }
  if (!data) return "CARICAMENTO"
  const attivo = data.subscriptions.find((s) => s.status === "active") // <- lo schianto
  return `PAGINA (abbonamento attivo: ${attivo ? "si" : "no"})`
}

async function prova(nome, base, statoAtteso, attesoVecchio, attesoNuovo) {
  const url = `${base}/api/admin/billing`
  const stato = await fetch(url).then((r) => r.status)
  const righe = []
  // Il caso non misura quel che credo se lo stato HTTP non e' quello atteso:
  // e' la trappola in cui sono gia' caduto (header `Host` ignorato -> 200).
  if (stato !== statoAtteso) {
    console.log(`\n  ${nome}`)
    console.log(`    KO   atteso HTTP ${statoAtteso}, ricevuto ${stato} -> il caso non sta misurando nulla`)
    return false
  }
  for (const [etichetta, f, atteso] of [
    ["VECCHIO", vecchio, attesoVecchio],
    ["NUOVO", nuovo, attesoNuovo],
  ]) {
    let esito
    try {
      esito = renderizza(await comeSwr(f, url))
    } catch (e) {
      esito = `SCHIANTO: ${e.constructor.name}: ${e.message}`
    }
    righe.push({ etichetta, esito, ok: esito.startsWith(atteso) })
  }
  console.log(`\n  ${nome} (HTTP ${stato})`)
  for (const r of righe) console.log(`    ${r.ok ? "OK  " : "KO  "} ${r.etichetta.padEnd(8)} -> ${r.esito}`)
  return righe.every((r) => r.ok)
}

const esiti = []

// CASO ROSSO: nessuna sessione. Il vecchio deve schiantarsi, il nuovo avvisare.
esiti.push(await prova("senza sessione", BASE_ESTERNO, 401, "SCHIANTO", "AVVISO: sessione scaduta"))

// CASO VERDE: bypass di sviluppo attivo (host localhost) -> 200 con dati veri.
// Entrambi devono rendere la pagina: se il nuovo fetcher rompesse il caso
// buono, qui si vedrebbe.
esiti.push(await prova("con sessione (bypass)", BASE, 200, "PAGINA", "PAGINA"))

// CONTROLLO NEGATIVO del misuratore: una rotta inesistente deve far fallire
// anche il fetcher nuovo. Se qui uscisse "PAGINA", non starei misurando nulla.
{
  const url = `${BASE_ESTERNO}/api/admin/billing-inesistente`
  const stato = await fetch(url).then((r) => r.status)
  let esitoNuovo
  try {
    esitoNuovo = renderizza(await comeSwr(nuovo, url))
  } catch (e) {
    esitoNuovo = `SCHIANTO: ${e.message}`
  }
  const ok = esitoNuovo.startsWith("AVVISO: errore")
  console.log(`\n  controllo negativo: rotta inesistente (HTTP ${stato})`)
  console.log(`    ${ok ? "OK  " : "KO  "} NUOVO    -> ${esitoNuovo}`)
  esiti.push(ok)
}

const tutti = esiti.every(Boolean)
console.log(`\n  ${tutti ? "TUTTE LE PROVE PASSANO" : "PROVE FALLITE"}\n`)
process.exit(tutti ? 0 : 1)
