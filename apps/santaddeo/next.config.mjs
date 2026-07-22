/** @type {import("next").NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  /**
   * imapflow (lettura risposte clienti via IMAP) dipende da pino ->
   * thread-stream, che include file di test/non-JS non bundlabili da
   * Turbopack. Lasciandoli come pacchetti server esterni vengono caricati
   * a runtime come moduli Node nativi, evitando l'errore di build.
   */
  serverExternalPackages: ["imapflow", "pino", "thread-stream", "mailparser"],
  images: {
    unoptimized: true,
  },
  /**
   * Redirect 301 permanenti per consolidamento SEO.
   *
   * /partner-info -> /partner (13/05/2026): le due pagine erano un doppione
   * funzionale (entrambi "programma partner") che si autosabotavano nel
   * crawl di Google. La pagina /partner ha contenuto piu' ricco
   * (struttura commissioni, vantaggi, esempi). Consolidiamo tutta
   * l'autorita' interna ed esterna su /partner.
   *
   * /home -> / (25/05/2026): GSC report "Pagina con reindirizzamento"
   * mostrava `/home` come URL conosciuto senza redirect attivo nel
   * sito. /home non e' mai esistito come route stabile (probabile
   * residuo di un vecchio link o dato JSON-LD). Mettiamo un 301
   * esplicito per consolidare a `/`.
   *
   * /mese -> / (25/05/2026): GSC report "Non trovata (404)" mostrava
   * `/mese` come URL conosciuto. Era una pagina effimera mai
   * pubblicata stabilmente. 301 alla home invece di lasciare il 404
   * fa consolidare eventuali backlink residui (improbabili ma costo
   * zero) e rimuove l'errore dal report di copertura.
   *
   * /signup -> /auth/sign-up (04/06/2026): la pagina di registrazione e'
   * a /auth/sign-up, ma alcune email-lead inviate ai prospect contenevano
   * il link errato /signup?ref=TOKEN (bug nel template custom venditori) ->
   * il lead cliccava e finiva su 404. Il redirect preserva la query string
   * (?ref=) cosi' i lead gia' contattati arrivano alla signup col tracking
   * intatto. La sorgente del link e' stata corretta a monte.
   */
  async redirects() {
    return [
      {
        source: "/signup",
        destination: "/auth/sign-up",
        permanent: false,
      },
      {
        source: "/partner-info",
        destination: "/partner",
        permanent: true,
      },
      {
        source: "/home",
        destination: "/",
        permanent: true,
      },
      {
        source: "/mese",
        destination: "/",
        permanent: true,
      },
    ]
  },
  /**
   * X-Robots-Tag: noindex sugli asset build di Next (18/07/2026).
   *
   * Contesto: Search Console (santaddeo.com) segnalava "Non trovata (404)"
   * con convalida fallita su URL tipo
   * /_next/static/chunks/<hash>.js?dpl=<deploy>. Sono CHUNK con hash di
   * deploy passati: Next rigenera gli hash a ogni build, quindi i vecchi
   * spariscono e restituiscono 404. Google li aveva scoperti come URL dai
   * <script src> di HTML in cache e li tracciava come "pagine".
   *
   * Questi header NON impediscono a Googlebot di scaricare i JS/CSS per il
   * rendering (comportamento documentato: le direttive di indicizzazione non
   * bloccano il fetch delle risorse necessarie al render), ma marcano
   * esplicitamente gli asset come non-indicizzabili, cosi' Google smette di
   * trattarli come pagine e col tempo escono dai report di indicizzazione.
   * NB: i 404 gia' presenti NON si cancellano via codice, si esauriscono da
   * soli quando Google ricrawla l'HTML che non referenzia piu' quegli hash.
   * Scope stretto a /_next/static (JS/CSS/font/media), NON /_next/image.
   */
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
    ]
  },
}

export default nextConfig
