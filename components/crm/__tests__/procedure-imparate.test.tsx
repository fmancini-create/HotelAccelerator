import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Il testo di una procedura BLOCCATA da una persona.
 *
 * Difetto visto a schermo e corretto: la catena di condizioni non guardava mai
 * `bloccata`, cosi' una decisione umana finiva nel ramo del conteggio. Con la
 * soglia raggiunta si leggeva "Ha raggiunto la soglia: attende conferma", e con
 * poche ripetizioni "Altre N ripetizioni prima di poter agire da sola": una
 * promessa di autonomia su qualcosa che una persona ha fermato.
 *
 * Qui si controlla l'ORDINE delle condizioni nel file, non il testo reso: il
 * componente legge la rete e per montarlo servirebbe un finto browser che
 * questo progetto non usa nelle prove. L'ordine e' esattamente cio' che era
 * sbagliato, quindi e' cio' che va difeso.
 */
describe("procedure imparate: una decisione umana non si conta", () => {
  const sorgente = readFileSync(join(process.cwd(), "components/crm/procedure-imparate.tsx"), "utf8")

  /*
   * Si guarda SOLO la catena che compone la frase, non tutto il file.
   *
   * Errore in cui sono caduto scrivendo questa prova: `p.risk === "alto"`
   * compare DUE volte (una nel badge del rischio, molto prima) e `indexOf`
   * restituiva la prima. La prova arrossiva su codice corretto. Un confronto di
   * posizioni vale solo dentro lo stesso perimetro.
   */
  const catena = (() => {
    const inizio = sorgente.indexOf("{`Vista ${p.occurrences}")
    const fine = sorgente.indexOf("</p>", inizio)
    if (inizio < 0 || fine < 0) throw new Error("catena del testo non trovata: la prova non sa cosa misurare")
    return sorgente.slice(inizio, fine)
  })()

  it("guarda 'bloccata' prima di contare le ripetizioni", () => {
    const posBloccata = catena.indexOf('p.status === "bloccata"')
    const posConteggio = catena.indexOf("mancanti > 0")

    expect(posBloccata, "manca del tutto il caso 'bloccata'").toBeGreaterThan(-1)
    expect(posConteggio, "manca il ramo del conteggio").toBeGreaterThan(-1)
    // Chi viene prima nella catena decide: se il conteggio precede, una
    // procedura bloccata ricade nel suo testo.
    expect(posBloccata).toBeLessThan(posConteggio)
  })

  it("guarda 'bloccata' prima del rischio alto", () => {
    const posBloccata = catena.indexOf('p.status === "bloccata"')
    const posRischio = catena.indexOf('p.risk === "alto"')

    expect(posRischio, "manca il ramo del rischio alto").toBeGreaterThan(-1)
    expect(posBloccata).toBeLessThan(posRischio)
  })

  it("al caso bloccata non promette autonomia futura", () => {
    // La frase del blocco deve negare l'autonomia, non rinviarla.
    const frase = "Una persona l'ha fermata: non agira' da sola, per quante volte si ripeta."
    expect(sorgente).toContain(frase)
  })

  it("il testo del conteggio esiste ancora per i casi che lo meritano", () => {
    // Controllo positivo: la correzione non deve aver cancellato il ramo
    // legittimo, altrimenti le prove sopra passerebbero su un file svuotato.
    expect(sorgente).toContain("prima di poter agire da sola")
    expect(sorgente).toContain("Ha raggiunto la soglia")
  })
})
