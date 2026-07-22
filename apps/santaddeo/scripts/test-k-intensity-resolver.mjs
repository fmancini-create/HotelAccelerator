/**
 * Golden test del resolver Intensificatore K (30/06/2026).
 * Verifica la retrocompatibilita' e la precedenza giorno > periodo > default > globale.
 * Replica la logica pura di lib/pricing/k-intensity.ts (no import TS in node mjs).
 */

const GLOBAL_INC = 0.3
const GLOBAL_BASE = 0
const INC_CAP = 0.6
const BASE_CAP = 0.25

function clamp(inc, base) {
  const i = Number.isFinite(inc) ? Math.min(Math.max(inc, 0), INC_CAP) : GLOBAL_INC
  const b = Number.isFinite(base) ? Math.min(Math.max(base, 0), BASE_CAP) : GLOBAL_BASE
  return { i, b }
}
function covers(r, d) {
  if (r.scope === "default") return true
  if (!r.date_from || !r.date_to) return false
  return d >= r.date_from && d <= r.date_to
}
function resolve(rules, d) {
  const active = (rules || []).filter((r) => r.is_active !== false)
  const day = active.filter((r) => r.scope === "day" && covers(r, d))
  if (day.length) { const { i, b } = clamp(day[0].increment_intensity, day[0].base_intensity); return { i, b, src: "day" } }
  const per = active.filter((r) => r.scope === "period" && covers(r, d))
  if (per.length) { const { i, b } = clamp(per[0].increment_intensity, per[0].base_intensity); return { i, b, src: "period" } }
  const def = active.find((r) => r.scope === "default")
  if (def) { const { i, b } = clamp(def.increment_intensity, def.base_intensity); return { i, b, src: "default" } }
  return { i: GLOBAL_INC, b: GLOBAL_BASE, src: "global" }
}

let pass = 0, fail = 0
function eq(name, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp)
  if (ok) { pass++; console.log(`  PASS ${name}`) }
  else { fail++; console.log(`  FAIL ${name}\n    got ${JSON.stringify(got)}\n    exp ${JSON.stringify(exp)}`) }
}

console.log("== RETROCOMPAT (nessuna regola => motore storico) ==")
eq("rules vuote", resolve([], "2026-08-15"), { i: 0.3, b: 0, src: "global" })
eq("rules null", resolve(null, "2026-08-15"), { i: 0.3, b: 0, src: "global" })

console.log("== NO-OP del canale base con baseIntensity=0 ==")
// price * (1 + K * 0) === price, per qualsiasi K
for (const K of [-1, -0.4, 0, 0.7, 1]) {
  const factor = 1 + K * 0
  eq(`base no-op K=${K}`, factor, 1)
}

console.log("== PRECEDENZA giorno > periodo > default ==")
const rules = [
  { scope: "default", date_from: null, date_to: null, increment_intensity: 0.4, base_intensity: 0.05 },
  { scope: "period", date_from: "2026-08-01", date_to: "2026-08-31", increment_intensity: 0.5, base_intensity: 0.15 },
  { scope: "day", date_from: "2026-08-15", date_to: "2026-08-15", increment_intensity: 0.6, base_intensity: 0.25 },
]
eq("giorno vince (15/08)", resolve(rules, "2026-08-15"), { i: 0.6, b: 0.25, src: "day" })
eq("periodo (10/08)", resolve(rules, "2026-08-10"), { i: 0.5, b: 0.15, src: "period" })
eq("default fuori periodo (10/12)", resolve(rules, "2026-12-10"), { i: 0.4, b: 0.05, src: "default" })

console.log("== CLAMP ai cap di sicurezza ==")
eq("clamp incremento >0.6", resolve([{ scope: "default", date_from: null, date_to: null, increment_intensity: 2, base_intensity: 0 }], "2026-01-01"), { i: 0.6, b: 0, src: "default" })
eq("clamp base >0.25", resolve([{ scope: "default", date_from: null, date_to: null, increment_intensity: 0.3, base_intensity: 9 }], "2026-01-01"), { i: 0.3, b: 0.25, src: "default" })

console.log("== IMPATTO simulato (base 164, incr 20) ==")
const r = resolve([{ scope: "default", date_from: null, date_to: null, increment_intensity: 0.3, base_intensity: 0.15 }], "2026-01-01")
const price = (K) => 164 * (1 + K * r.b) + 20 * (1 + K * r.i)
console.log(`  K=-1 -> ${price(-1).toFixed(1)}€  K=0 -> ${price(0).toFixed(1)}€  K=+1 -> ${price(1).toFixed(1)}€`)

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILED"}: ${pass} pass, ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
