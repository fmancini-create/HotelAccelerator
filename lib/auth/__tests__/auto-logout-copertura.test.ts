import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { MINUTI_DISCONNESSIONE_PIATTAFORMA, TEMPI_DISCONNESSIONE, tempoAmmesso } from "@/lib/auth/auto-logout"

/**
 * COPERTURA della disconnessione automatica.
 *
 * Le prove in `auto-logout.test.ts` verificano che il CALCOLO del tempo sia
 * giusto. Non verificavano una cosa diversa e piu' importante: che il presidio
 * sia effettivamente MONTATO in ogni area riservata, e che per chi lo riceve
 * arrivi un tempo utilizzabile.
 *
 * Il difetto che ha reso necessario questo file: `AutoLogoutWatchdog` era
 * montato solo in `app/admin/layout.tsx`. L'area super-admin si e' costruita
 * un'intestazione tutta sua e non se l'e' portata dietro ⇒ il ruolo con piu'
 * poteri era l'unico mai disconnesso.
 */

const radice = process.cwd()
const leggi = (p: string) => readFileSync(join(radice, p), "utf8")

/**
 * I layout che racchiudono un'area riservata. Elenco esplicito: aggiungendo
 * un'area nuova va aggiunta qui, e questo e' il punto in cui accorgersene.
 */
const LAYOUT_RISERVATI = ["app/admin/layout.tsx", "app/super-admin/layout.tsx"]

describe("il presidio di inattivita' copre OGNI area riservata", () => {
  it("l'elenco dei layout non e' vuoto e i file esistono davvero", () => {
    /*
     * Controllo positivo. Senza questo, un errore di battitura in un percorso
     * renderebbe l'elenco silenziosamente vuoto e il ciclo qui sotto girerebbe
     * a vuoto restando VERDE: la prova sembrerebbe superata senza aver
     * guardato niente.
     */
    expect(LAYOUT_RISERVATI.length).toBeGreaterThan(1)
    for (const p of LAYOUT_RISERVATI) {
      expect(() => leggi(p), `${p}: file non trovato`).not.toThrow()
    }
  })

  /*
   * Si scorre e si pretende su CIASCUN layout, uno per uno.
   *
   * Non "almeno un layout monta il presidio": con quella forma, togliendolo da
   * uno solo l'altro terrebbe il verde — ed e' esattamente il caso che questa
   * prova esiste per cogliere, perche' e' quello che era accaduto.
   */
  for (const percorso of LAYOUT_RISERVATI) {
    it(`${percorso} monta AutoLogoutWatchdog`, () => {
      const s = leggi(percorso)
      expect(s, `${percorso}: manca l'import del presidio`).toContain("auto-logout-watchdog")
      expect(s, `${percorso}: il presidio non viene disegnato`).toContain("<AutoLogoutWatchdog />")
    })
  }
})

describe("per un super admin il presidio non e' inerte", () => {
  const rotta = leggi("app/api/me/auto-logout/route.ts")

  it("il tempo di piattaforma e' fra quelli ammessi, altrimenti il browser lo scarta", () => {
    /*
     * Il browser convalida il valore con `tempoAmmesso` prima di usarlo: un
     * numero fuori dall'elenco verrebbe ignorato in SILENZIO e la protezione
     * sembrerebbe attiva restando spenta. Questa e' la prova che distingue
     * "presidio montato" da "presidio che funziona".
     */
    expect(tempoAmmesso(MINUTI_DISCONNESSIONE_PIATTAFORMA)).toBe(true)
    expect([...TEMPI_DISCONNESSIONE]).toContain(MINUTI_DISCONNESSIONE_PIATTAFORMA)
  })

  it("la rotta riconosce il super admin e gli restituisce il tempo di piattaforma", () => {
    expect(rotta, "la rotta non distingue il super admin").toContain('identity.role === "super_admin"')
    expect(rotta, "non restituisce il tempo di piattaforma").toContain("MINUTI_DISCONNESSIONE_PIATTAFORMA")
  })

  it("decide il super admin PRIMA del ritorno che annulla il tempo", () => {
    /*
     * Questa e' la prova piu' importante del file, ed e' una prova di ORDINE.
     * Il ramo `if (!adminUserId) return { minuti: null }` intercetta anche il
     * super admin, perche' la sua identita' ha `adminUserId: null` per
     * costruzione. Se il riconoscimento stesse DOPO, non verrebbe mai
     * raggiunto: il codice sarebbe presente, leggibile, e completamente
     * inerte — una difesa disegnata su un muro.
     */
    const superAdmin = rotta.indexOf('identity.role === "super_admin"')
    const annulla = rotta.indexOf("if (!adminUserId)")

    expect(superAdmin, "manca il riconoscimento del super admin").toBeGreaterThan(-1)
    expect(annulla, "manca il ramo che annulla il tempo").toBeGreaterThan(-1)

    // Confronto di posizioni valido: entrambi i punti sono unici nel file.
    expect(rotta.split('identity.role === "super_admin"').length - 1).toBe(1)
    expect(rotta.split("if (!adminUserId)").length - 1).toBe(1)

    expect(superAdmin, "il riconoscimento del super admin arriva troppo tardi: difesa inerte").toBeLessThan(annulla)
  })
})
