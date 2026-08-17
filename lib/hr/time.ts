/**
 * Conversione fra l'ora "da orologio" italiana e l'istante assoluto salvato a DB.
 *
 * I turni si inseriscono scrivendo l'ora che il dipendente legge sull'orologio
 * ("07:30"), ma `hr_shifts.starts_at` e' un `timestamptz`, cioe' un istante
 * assoluto. Il server gira in UTC: interpretare "07:30" con il fuso del processo
 * salvava 07:30Z, che un browser italiano rimostra come 09:30 in estate (09:30
 * anche in tabellone e in notifica). Lo scarto cambia con l'ora legale, quindi
 * non e' fissato a mano ma ricavato dal fuso `Europe/Rome`.
 *
 * Stesso metodo usato da `inizioGiornataItaliana` in app/api/telephony/calls.
 */

const FUSO = "Europe/Rome"

const formattatore = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

/** Scarto fra ora italiana e UTC nell'istante dato: +2h in estate, +1h in inverno. */
function scartoMs(istante: Date): number {
  const p = Object.fromEntries(formattatore.formatToParts(istante).map((x) => [x.type, x.value])) as Record<
    string,
    string
  >
  const oraLocaleComeUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour === "24" ? "0" : p.hour),
    Number(p.minute),
    Number(p.second),
  )
  return oraLocaleComeUtc - istante.getTime()
}

/**
 * "2026-08-20" + "07:30" (ora italiana) -> istante UTC corrispondente.
 *
 * Due passaggi perche' lo scarto va misurato nell'istante giusto: nei giorni di
 * cambio orario il primo tentativo puo' cadere dal lato sbagliato del salto.
 */
export function istanteDaOraItaliana(giorno: string, ora: string): Date {
  const [y, m, d] = giorno.split("-").map(Number)
  const [hh, mm] = ora.split(":").map(Number)
  const oraDaOrologio = Date.UTC(y, m - 1, d, hh, mm, 0)
  const primo = oraDaOrologio - scartoMs(new Date(oraDaOrologio))
  const secondo = oraDaOrologio - scartoMs(new Date(primo))
  return new Date(secondo)
}

/** Giorno italiano ("yyyy-MM-dd") a cui appartiene un istante. */
export function giornoItaliano(istante: Date | string): string {
  const d = typeof istante === "string" ? new Date(istante) : istante
  const p = Object.fromEntries(formattatore.formatToParts(d).map((x) => [x.type, x.value])) as Record<string, string>
  return `${p.year}-${p.month}-${p.day}`
}

/** Mezzanotte italiana del giorno indicato, come istante UTC. */
export function inizioGiornoItaliano(giorno: string): Date {
  return istanteDaOraItaliana(giorno, "00:00")
}
