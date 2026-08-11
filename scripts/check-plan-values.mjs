/**
 * Controllo: i piani ammessi dal CODICE coincidono con quelli del DATABASE?
 *
 * PERCHE' ESISTE. Il tipo `Plan` dichiarava `trial | basic | pro | enterprise`
 * mentre il vincolo `valid_plan` della tabella `properties` ammette
 * `free | starter | professional | enterprise`: TRE valori su quattro non
 * esistevano a livello di dati. In piu' il valore predefinito della colonna
 * era 'trial', che il vincolo stesso RIFIUTA, quindi ogni inserimento che
 * ometteva il piano falliva. Nessun controllo se ne accorgeva, perche' i tipi
 * spariscono in esecuzione e nessuno confrontava le due liste.
 *
 * COSA MISURA. Che `isPlan` accetti esattamente i quattro valori ammessi dal
 * database e rifiuti tutto il resto, inclusi i tre valori fantasma del vecchio
 * tipo ("trial", "basic", "pro"). Include il caso del valore predefinito: se
 * `DEFAULT_PLAN` non fosse un piano valido, ricadremmo nel difetto di partenza.
 *
 * ATTENZIONE. L'elenco di riferimento qui sotto e' scritto a mano di
 * proposito: se fosse importato dallo stesso file che deve sorvegliare, il
 * controllo confronterebbe una lista con se stessa e sarebbe sempre verde.
 */

const AMMESSI_DAL_DATABASE = ["free", "starter", "professional", "enterprise"]

const m = await import("../lib/types/super-admin.types.ts")

let rossi = 0
const esito = (ok, testo) => {
  if (!ok) rossi++
  console.log(`  ${ok ? "OK   " : "ROSSO"} ${testo}`)
}

console.log("\nPiani ammessi dal codice contro quelli ammessi dal database\n")

// 1) Le due liste devono coincidere, senza riguardo all'ordine.
const daCodice = [...m.PLAN_VALUES].sort().join(",")
const daDatabase = [...AMMESSI_DAL_DATABASE].sort().join(",")
esito(daCodice === daDatabase, `elenco: codice [${daCodice}] contro database [${daDatabase}]`)

// 2) Controllo positivo: ogni piano valido deve essere accettato.
for (const p of AMMESSI_DAL_DATABASE) {
  esito(m.isPlan(p) === true, `isPlan("${p}") deve accettare`)
}

// 3) Controllo negativo: i valori fantasma del vecchio tipo e i casi limite
//    devono essere rifiutati. Senza questa parte il controllo passerebbe anche
//    con una funzione che dice sempre "si'".
for (const p of ["trial", "basic", "pro", "inventato", "", "FREE"]) {
  esito(m.isPlan(p) === false, `isPlan(${JSON.stringify(p)}) deve rifiutare`)
}
for (const p of [null, undefined, 42, {}]) {
  esito(m.isPlan(p) === false, `isPlan(${JSON.stringify(p) ?? String(p)}) deve rifiutare`)
}

// 4) Il valore predefinito deve essere a sua volta un piano valido: e'
//    esattamente il difetto trovato nel database ('trial' come predefinito).
esito(m.isPlan(m.DEFAULT_PLAN), `il predefinito "${m.DEFAULT_PLAN}" deve essere un piano valido`)

console.log("")
if (rossi === 0) {
  console.log("Piani allineati fra codice e database.\n")
  process.exit(0)
}
console.log(`FALLITO: ${rossi} controlli rossi.`)
console.log("Se hai cambiato i piani nel database, aggiorna PLAN_VALUES **e** l'elenco")
console.log("di riferimento in questo file: sono volutamente due copie separate.\n")
process.exit(1)
