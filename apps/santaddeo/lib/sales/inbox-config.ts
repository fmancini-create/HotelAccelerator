/**
 * Configurazione della casella centralizzata che raccoglie le RISPOSTE dei
 * clienti alle email inviate dai venditori SANTADDEO.
 *
 * Le email partono da noreply@santaddeo.com con un header Reply-To "ibrido":
 *  - l'email personale del venditore (cosi' la riceve direttamente)
 *  - clienti@4bid.it (questa casella) cosi' la piattaforma puo' leggerla via
 *    IMAP, registrarla e renderla supervisionabile dal super admin.
 *
 * Host/porta/utente hanno default Gmail (Google Workspace) perche' la casella
 * e' clienti@4bid.it. L'unico segreto e' la "App Password" IMAP.
 */
export function getSalesInboxConfig() {
  const address = process.env.SALES_INBOX_ADDRESS || "clienti@4bid.it"
  const host = process.env.SALES_INBOX_IMAP_HOST || "imap.gmail.com"
  const port = Number(process.env.SALES_INBOX_IMAP_PORT || "993")
  const user = process.env.SALES_INBOX_IMAP_USER || address
  const pass = (process.env.SALES_INBOX_IMAP_PASSWORD || "").replace(/\s+/g, "")
  return {
    address,
    host,
    port,
    user,
    pass,
    /** true se l'IMAP e' configurabile (segreto presente). */
    enabled: Boolean(pass),
  }
}

export interface SalesInboxConfig {
  /** Etichetta diagnostica della casella (per i log). */
  label: string
  address: string
  host: string
  port: number
  user: string
  pass: string
  enabled: boolean
}

/**
 * Restituisce TUTTE le caselle IMAP da scandire per le risposte dei clienti.
 *
 *  1. clienti@4bid.it (principale): riceve la copia via Reply-To ibrido/BCC.
 *  2. noreply@santaddeo.com (secondaria, opzionale): e' l'indirizzo da cui
 *     partono le email dei venditori ED e' la casella su cui Google Workspace
 *     fa confluire gli ALIAS dei venditori (es. f.errico@santaddeo.com). Senza
 *     leggerla, una mail scritta a mano all'alias del venditore non entrerebbe
 *     mai in piattaforma. Si abilita fornendo la sua app password dedicata.
 *
 * Ogni casella e' indipendente: se manca il segreto, viene semplicemente
 * saltata (enabled=false) senza bloccare le altre.
 */
export function getSalesInboxConfigs(): SalesInboxConfig[] {
  const primary = getSalesInboxConfig()
  const configs: SalesInboxConfig[] = [
    { label: "clienti@4bid.it", ...primary },
  ]

  // Casella secondaria: noreply@santaddeo.com (raccoglie gli alias venditore).
  const secondaryAddress = process.env.SALES_INBOX_2_ADDRESS || "noreply@santaddeo.com"
  const secondaryPass = (process.env.SALES_INBOX_2_IMAP_PASSWORD || "").replace(/\s+/g, "")
  configs.push({
    label: secondaryAddress,
    address: secondaryAddress,
    host: process.env.SALES_INBOX_2_IMAP_HOST || "imap.gmail.com",
    port: Number(process.env.SALES_INBOX_2_IMAP_PORT || "993"),
    user: process.env.SALES_INBOX_2_IMAP_USER || secondaryAddress,
    pass: secondaryPass,
    enabled: Boolean(secondaryPass),
  })

  return configs
}

/**
 * Costruisce il valore Reply-To "ibrido": email del venditore + casella
 * piattaforma, separati da virgola. Se per qualche motivo manca l'email del
 * venditore, ripiega sulla sola casella piattaforma.
 */
export function buildHybridReplyTo(agentEmail?: string | null): string {
  const inbox = getSalesInboxConfig().address
  const seller = (agentEmail || "").trim()
  if (seller && seller.toLowerCase() !== inbox.toLowerCase()) {
    return `${seller}, ${inbox}`
  }
  return inbox
}

/**
 * Costruisce il Reply-To "pulito": se il venditore ha un alias @santaddeo.com
 * verificato, le risposte del cliente vanno DIRETTAMENTE all'alias (che su
 * Google Workspace confluisce nella casella noreply@santaddeo.com, scandita via
 * IMAP -> SALES_INBOX_2 -> entra in piattaforma).
 *
 * Se l'alias manca (venditore senza identita' santaddeo.com), si ripiega sul
 * Reply-To ibrido (email personale + clienti@4bid.it) per non perdere la
 * cattura della risposta.
 */
export function buildSellerReplyTo(senderEmail?: string | null, agentEmail?: string | null): string {
  const alias = (senderEmail || "").trim().toLowerCase()
  if (alias && /^[^\s@]+@santaddeo\.com$/.test(alias)) {
    return alias
  }
  return buildHybridReplyTo(agentEmail)
}

/**
 * Indirizzo a cui inviare in BCC nascosto una copia archivio di OGNI email in
 * uscita dei venditori, cosi' il super admin ha un archivio completo anche in
 * casella (oltre alla supervisione dal pannello CRM). Default: clienti@4bid.it.
 */
export function getArchiveBccAddress(): string {
  return process.env.SALES_ARCHIVE_BCC || process.env.SALES_INBOX_ADDRESS || "clienti@4bid.it"
}

/**
 * Costruisce l'header From dell'email del venditore con la sua IDENTITA':
 *   "Mario Rossi <m.rossi@santaddeo.com>"
 *
 * IMPORTANTE (Google Workspace): perche' Gmail non riscriva il From, l'indirizzo
 * `senderEmail` deve essere un alias verificato in "Invia messaggi come"
 * dell'account SMTP. Se `senderEmail` non e' del dominio santaddeo.com (o non e'
 * configurato), si ripiega sul From di default (noreply@santaddeo.com) per non
 * rischiare il rifiuto/spam.
 *
 * @returns la stringa From da passare a sendEmail, oppure null per usare il default.
 */
export function buildSellerFrom(
  senderEmail?: string | null,
  senderName?: string | null,
): string | null {
  const email = (senderEmail || "").trim().toLowerCase()
  // Solo indirizzi @santaddeo.com sono inviabili in modo affidabile dal nostro
  // SMTP (DKIM/SPF allineati + alias verificato su Workspace).
  if (!email || !/^[^\s@]+@santaddeo\.com$/.test(email)) return null
  const name = (senderName || "").trim()
  return name ? `${name} <${email}>` : email
}
