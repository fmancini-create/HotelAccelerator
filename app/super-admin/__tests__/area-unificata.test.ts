import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Contratto: l'area di piattaforma e quella operativa sono UNA SOLA area.
 *
 * Il difetto che queste prove esistono per cogliere non e' estetico. Due cornici
 * gemelle divergono, e divergevano davvero: menu con 5 voci su 7 pagine,
 * nessuna via di ritorno, avvisi muti, disconnessione per inattivita' assente
 * proprio sul ruolo piu' potente. Ogni prova qui sotto e' scritta per fallire se
 * la duplicazione torna.
 */

const radice = process.cwd()
const leggi = (p: string) => readFileSync(join(radice, p), "utf8")

/**
 * Il file SENZA i commenti.
 *
 * Serve perche' un commento non e' codice: la prima versione di queste prove era
 * ROSSA su codice CORRETTO, perche' cercava la parola "getMockStats" e la
 * trovava nel commento che spiega perche' quel ripiego e' stato rimosso. Un
 * controllo che legge i commenti da' allarmi falsi e, peggio, si lascia
 * ingannare da un difetto nascosto in una riga commentata.
 */
const leggiCodice = (p: string) =>
  leggi(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")

const LAYOUT_PIATTAFORMA = "app/super-admin/layout.tsx"
const LAYOUT_OPERATIVO = "app/admin/layout.tsx"
const PAGINA_INDICE = "app/super-admin/page.tsx"
const PANNELLO = "components/platform/platform-overview-panel.tsx"
const ACCESSO = "lib/auth/authorize-user.ts"
const CRUSCOTTO = "app/admin/dashboard/page.tsx"

describe("una sola cornice", () => {
  it("il layout di piattaforma usa PlatformShell, non un'intestazione propria", () => {
    const l = leggiCodice(LAYOUT_PIATTAFORMA)
    expect(l, "non usa la cornice condivisa").toContain("PlatformShell")

    /*
     * Il cuore della prova. Non si cerca "manca <header>": si pretende che qui
     * NON ci sia un secondo elenco di destinazioni scritto a mano. Prima erano
     * cinque voci `{ name: ..., href: "/super-admin/..." }` dentro questo file,
     * e le pagine su disco erano sette.
     */
    const vociAMano = l.match(/href:\s*"\/super-admin/g) ?? []
    expect(
      vociAMano.length,
      `questo file dichiara ${vociAMano.length} destinazioni a mano: il menu deve venire da NAV_ENTRIES`,
    ).toBe(0)
    expect(l, "ricompare una barra di navigazione propria").not.toMatch(/<nav\b/)
  })

  it("monta gli avvisi e la disconnessione, come l'area operativa", () => {
    const piattaforma = leggi(LAYOUT_PIATTAFORMA)
    const operativa = leggi(LAYOUT_OPERATIVO)

    // Confronto fra i due file: cio' che protegge l'area operativa deve
    // proteggere anche questa. E' il controllo che mancava.
    for (const presidio of ["ClientToaster", "AutoLogoutWatchdog"]) {
      expect(operativa, `riferimento incoerente: ${presidio} non e' nell'area operativa`).toContain(presidio)
      expect(piattaforma, `${presidio} manca nell'area di piattaforma`).toContain(presidio)
    }
  })

  it("conserva la guardia di ruolo, che e' la ragione per cui il file esiste", () => {
    const l = leggi(LAYOUT_PIATTAFORMA)
    expect(l, "non verifica piu' il ruolo").toContain("super_admin")
    expect(l, "non verifica piu' che il collaboratore sia attivo").toContain("is_active")
    // In errore si nega: un guasto nel controllo non e' un permesso.
    expect(l.match(/router\.push\("\/admin"\)/g)?.length ?? 0, "manca il rifiuto in caso di errore").toBeGreaterThan(2)
  })
})

describe("un solo cruscotto", () => {
  it("/super-admin rimanda al cruscotto unico invece di essere una seconda dashboard", () => {
    const p = leggiCodice(PAGINA_INDICE)
    expect(p, "non rimanda da nessuna parte").toContain("redirect(")
    expect(p, "non rimanda al cruscotto unico").toContain('"/admin/dashboard"')
    // Se tornasse a disegnare riquadri, sarebbe di nuovo una pagina gemella.
    expect(p, "e' tornata a essere una dashboard").not.toContain("CardHeader")
  })

  it("dopo l'accesso c'e' una sola destinazione", () => {
    const a = leggiCodice(ACCESSO)
    const verso = a.match(/destination: "[^"]+"/g) ?? []
    expect(verso.length, "nessuna destinazione dichiarata").toBeGreaterThan(0)
    for (const d of verso) {
      expect(d, "l'accesso smista ancora su due cruscotti diversi").toBe('destination: "/admin/dashboard"')
    }
  })

  it("il cruscotto distingue il ruolo di piattaforma da quello di struttura", () => {
    const c = leggiCodice(CRUSCOTTO)
    expect(c, "non mostra la vista d'insieme").toContain("PlatformOverviewPanel")

    /*
     * ATTENZIONE — questa e' la prova che protegge i clienti fra loro.
     * `isAdmin` comprende anche l'amministratore di una singola struttura: se il
     * pannello fosse legato a quello, un albergatore vedrebbe il fatturato della
     * piattaforma e l'elenco dei concorrenti. Si pretende la condizione esatta.
     */
    expect(c, "la vista d'insieme non e' legata al ruolo di piattaforma").toMatch(
      /risposta\.isPlatformAdmin\s*&&\s*<PlatformOverviewPanel/,
    )
  })
})

describe("nessun numero inventato", () => {
  it("il pannello non ripiega su dati finti quando l'API non risponde", () => {
    const p = leggiCodice(PANNELLO)

    /*
     * Prima la pagina aveva `getMockStats()`, usato SIA quando la risposta non
     * era ok SIA nel catch: una sessione scaduta faceva comparire "1 tenant" e
     * "Villa I Barronci" con l'aria di essere veri. Un cruscotto che mente e'
     * peggio di uno rotto, perche' chi guarda non sa di star guardando
     * un'invenzione.
     */
    for (const spia of ["getMockStats", "mockStats", "Villa I Barronci"]) {
      expect(p, `il pannello contiene ancora dati inventati (${spia})`).not.toContain(spia)
    }

    // E deve invece rendere visibile il guasto.
    expect(p, "un guasto resterebbe invisibile").toContain("Dati della piattaforma non disponibili")
    expect(p, "non distingue la sessione scaduta dal guasto").toContain("Sessione scaduta")
  })
})
