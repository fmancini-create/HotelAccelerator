import assert from "node:assert/strict"

function resolveUniqueTarget(targets: string[]): string | null {
  const unique = [...new Set(targets.filter(Boolean))]
  return unique.length === 1 ? unique[0] : null
}

assert.equal(resolveUniqueTarget([]), null)
assert.equal(resolveUniqueTarget(["4bid"]), "4bid")
assert.equal(resolveUniqueTarget(["4bid", "4bid"]), "4bid")
assert.equal(resolveUniqueTarget(["4bid", "hotel"]), null)

console.log("3CX shared PBX routing contract OK")
