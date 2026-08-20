/**
 * Contratto: dal super-admin si entra DAVVERO in una struttura.
 *
 * Difetto che questa prova esiste per cogliere: il pulsante "Impersona" era
 * finto (un console.log e un alert "Funzionalita' in arrivo"), mentre il
 * meccanismo lato server esisteva gia'. E l'alert prometteva "modalita' SOLA
 * LETTURA", cosa che il cambio di contesto NON fa: da' accesso pieno.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const leggi = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const BOTTONE = "components/super-admin/enter-tenant-button.tsx"
const ELENCO = "app/super-admin/structures/page.tsx"
const DETTAGLIO = "app/super-admin/structures/[id]/page.tsx"

describe("super-admin: entrare in una struttura", () => {
  it("nessun pulsante finto rimasto nelle pagine strutture", () => {
    for (const p of [ELENCO, DETTAGLIO]) {
      const s = leggi(p)
      expect(s, `${p}: promessa "in arrivo" ancora presente`).not.toMatch(/Funzionalit[aà] in arrivo|coming soon/i)
      expect(s, `${p}: handler finto ancora presente`).not.toMatch(/handleImpersonate/)
    }
  })

  it("nessuna promessa di sola lettura: il cambio di contesto NON la garantisce", () => {
    // La rotta switch-tenant scrive solo il cookie del contesto: nessun limite
    // di scrittura. Promettere "sola lettura" farebbe agire il super admin
    // convinto di non poter fare danni.
    const rotta = leggi("app/api/platform/switch-tenant/route.ts")
    expect(rotta, "se la rotta imponesse davvero la sola lettura, questa prova va rivista").not.toMatch(
      /read.?only|sola.?lettura/i,
    )

    for (const p of [ELENCO, DETTAGLIO]) {
      const s = leggi(p)
      // Si accetta la frase che NEGA la sola lettura ("non in sola lettura"):
      // si cerca quindi la promessa in positivo.
      const promesse = s.match(/READ-ONLY|Read-only|modalit[aà] SOLA LETTURA|\(Read-only\)/g) || []
      expect(promesse, `${p}: promette la sola lettura: ${promesse.join(", ")}`).toHaveLength(0)
    }
  })

  it("il pulsante chiama switch-tenant E porta in /admin, dentro la STESSA funzione", () => {
    /*
     * Perche' "dentro la stessa funzione": due condizioni verificate
     * separatamente non provano che stiano nello stesso posto. Cercando la
     * chiamata e la navigazione ovunque nel file, un pulsante che cambia
     * contesto senza portarti da nessuna parte (o che naviga senza cambiare
     * contesto) resterebbe verde.
     */
    const s = leggi(BOTTONE)
    const inizio = s.indexOf("const handleEnter")
    expect(inizio, "funzione handleEnter non trovata: la prova non sa cosa misurare").toBeGreaterThan(-1)
    const fine = s.indexOf("\n  }", inizio)
    expect(fine, "fine di handleEnter non trovata").toBeGreaterThan(inizio)
    const corpo = s.slice(inizio, fine)

    expect(corpo, "non chiama la rotta che cambia struttura").toContain("/api/platform/switch-tenant")
    expect(corpo, "non porta nell'area operativa").toMatch(/router\.push\(\s*["']\/admin["']\s*\)/)
    expect(corpo, "manca il metodo POST").toContain('method: "POST"')
  })

  it("un fallimento si VEDE: nessun Toaster nell'area super-admin, quindi errore in pagina", () => {
    const layout = leggi("app/super-admin/layout.tsx")
    expect(layout, "se ora c'e' un Toaster, si puo' usare un toast e questa prova va rivista").not.toMatch(/Toaster/)

    const s = leggi(BOTTONE)
    const inizio = s.indexOf("if (!res.ok)")
    expect(inizio, "manca il ramo di errore").toBeGreaterThan(-1)
    /*
     * Si legge il ramo fino alla sua VERA chiusura, non una finestra a numero
     * fisso. Scrivendo questa prova avevo usato 400 caratteri e il `setError`
     * cadeva a 419: la prova arrossiva su codice corretto. Un commento in piu'
     * dentro il ramo non deve poter rompere la misura.
     */
    const fineRamo = s.indexOf("\n      }", inizio)
    expect(fineRamo, "chiusura del ramo di errore non trovata").toBeGreaterThan(inizio)
    const ramo = s.slice(inizio, fineRamo)
    expect(ramo, "il ramo di errore non comunica nulla all'utente").toContain("setError")
    expect(s, "l'errore non e' annunciato ai lettori di schermo").toContain('role="alert"')
  })
})
