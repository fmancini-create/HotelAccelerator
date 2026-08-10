/**
 * Censimento dell'ISOLAMENTO FRA TENANT nelle rotte API.
 *
 * Il perno multi-tenant e' `property_id`. 65 rotte su 135 usano la chiave di
 * servizio, che SCAVALCA le politiche del database: per quelle l'isolamento non
 * puo' venire da RLS, deve essere esplicito nella query.
 *
 * La domanda che conta non e' "la rotta nomina property_id?" ma:
 *   **da DOVE arriva il property_id usato nella query?**
 *     - dalla SESSIONE  -> non falsificabile, corretto
 *     - dalla RICHIESTA -> falsificabile, va confrontato con la sessione
 *
 * Questo script NON dichiara falle: classifica e mostra le righe, perche' una
 * rotta che accetta un property_id dalla richiesta puo' essere legittima (un
 * superadmin che cambia tenant) o validarlo poco sotto.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const RADICE = "app/api"

function rotte(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) rotte(p, out)
    else if (e === "route.ts") out.push(p)
  }
  return out
}

// Un solo criterio, usato ovunque: niente due espressioni che dissentono.
//
// TRAPPOLA GIA' SCATTATA: la prima versione conteneva `= await (req|request)`
// e classificava come "dalla richiesta" anche
//     const { propertyId } = await requireTenantAdmin(request)
// che invece legge dalla SESSIONE ed e' il caso PIU' SICURO di tutti —
// perche' `requireTenantAdmin(request)` CONTIENE la sottostringa `req`.
// Risultato: 18 rotte segnalate, in larga maggioranza false.
// Ora la sorgente deve essere ESATTAMENTE la richiesta (`request.json()`,
// `req.body`...), non una funzione che riceve la richiesta come argomento.
const DA_RICHIESTA = new RegExp(
  [
    // ?propertyId= nella query string
    /searchParams\.get\(\s*["'](?:property_?[Ii]d|propertyId)["']\s*\)/.source,
    // destrutturato direttamente dal corpo della richiesta
    /\{[^{}]*\bproperty_?[Ii]d\b[^{}]*\}\s*=\s*(?:await\s+)?(?:req|request)\s*\.\s*(?:json|formData|text)\s*\(/.source,
    // letto come campo di un corpo gia' estratto
    /\b(?:body|payload|json|input)\s*[.?]\s*property_?[Ii]d\b/.source,
  ].join("|"),
)

const DA_SESSIONE = /resolvePropertyIdForCaller|getAuthenticatedPropertyId|getCurrentProperty|requireTenantAdmin|getCallerIdentity/

const SUPERADMIN = /isSuperAdmin/

/**
 * CONTROLLO POSITIVO e NEGATIVO sul criterio.
 * Dopo la correzione, il rischio opposto e' un criterio troppo stretto che non
 * riconosce piu' nulla e produce uno zero rassicurante e falso.
 */
function validaCriterio() {
  const devePassare = [
    `const { provider, property_id } = await request.json()`,
    `const propertyId = searchParams.get("propertyId")`,
    `const pid = body.property_id`,
  ]
  const nonDevePassare = [
    `const { propertyId } = await requireTenantAdmin(request)`,
    `const { supabase, propertyId } = await requireProperty()`,
    `const propertyId = identity.propertyId`,
  ]
  for (const r of devePassare) {
    if (!DA_RICHIESTA.test(r)) {
      console.error(`CRITERIO CIECO: non riconosce una lettura dalla richiesta:\n    ${r}`)
      process.exit(1)
    }
  }
  for (const r of nonDevePassare) {
    if (DA_RICHIESTA.test(r)) {
      console.error(`CRITERIO TROPPO LARGO: scambia la sessione per la richiesta:\n    ${r}`)
      process.exit(1)
    }
  }
}

function main() {
  validaCriterio()
  const gruppi = { falsificabile: [], validata: [], solo_sessione: [], non_multitenant: [] }

  for (const f of rotte(RADICE).sort()) {
    const testo = readFileSync(f, "utf8")
    const nome = f.replace(/^app\/api\//, "").replace(/\/route\.ts$/, "")
    const nominaProperty = /property_?[Ii]d/.test(testo)

    if (!nominaProperty) {
      gruppi.non_multitenant.push(nome)
      continue
    }

    const daRichiesta = DA_RICHIESTA.test(testo)
    const daSessione = DA_SESSIONE.test(testo)

    if (!daRichiesta) {
      gruppi.solo_sessione.push(nome)
      continue
    }

    // Arriva dalla richiesta: c'e' un confronto con l'identita' della sessione?
    const confronta =
      /(?:identity|caller|auth|session|me)\s*[.?]\s*propertyId/.test(testo) ||
      /!==\s*(?:identity|caller)\b/.test(testo) ||
      SUPERADMIN.test(testo)

    const righe = testo
      .split("\n")
      .map((r, i) => [i + 1, r])
      .filter(([, r]) => DA_RICHIESTA.test(r))
      .slice(0, 2)
      .map(([n, r]) => `${n}: ${r.trim().slice(0, 88)}`)

    ;(confronta ? gruppi.validata : gruppi.falsificabile).push({ nome, daSessione, righe })
  }

  console.log("CENSIMENTO ISOLAMENTO FRA TENANT")
  console.log("=".repeat(72))
  console.log(`Rotte totali .................... ${rotte(RADICE).length}`)
  console.log(`Non multi-tenant (no property) .. ${gruppi.non_multitenant.length}`)
  console.log(`Property SOLO dalla sessione .... ${gruppi.solo_sessione.length}  (corrette)`)
  console.log(`Property da richiesta, validata .. ${gruppi.validata.length}  (da rileggere)`)
  console.log(`Property da richiesta, NON validata ${gruppi.falsificabile.length}  <-- da guardare`)
  console.log("")

  if (gruppi.falsificabile.length) {
    console.log("DA GUARDARE UNA PER UNA (non ancora dichiarate falle):")
    for (const r of gruppi.falsificabile) {
      console.log(`\n  ${r.nome}   [identita' presente: ${r.daSessione ? "si" : "NO"}]`)
      for (const l of r.righe) console.log(`      ${l}`)
    }
  }

  console.log("\n\nCON VALIDAZIONE APPARENTE (verificare che sia reale):")
  for (const r of gruppi.validata) console.log(`  - ${r.nome}`)
}

main()
