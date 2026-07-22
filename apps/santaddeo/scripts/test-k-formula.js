/**
 * Test script to verify K-driven formula matches Excel simulation
 */

// Formula functions
function calculatePI(K, PMIN, PMAX) {
  const clampedK = Math.max(0, Math.min(10, K))
  return PMIN + (clampedK / 10) * (PMAX - PMIN)
}

function calculatePriceForCamera(N, K, PMIN, PMAX, A, X, PI) {
  const pricePI = PI ?? calculatePI(K, PMIN, PMAX)
  const clampedA = Math.max(2, Math.min(10, A))
  
  if (N === 1) return pricePI
  
  const aN1 = Math.pow(clampedA, N - 1)
  const denominator = aN1 - 1
  
  if (denominator === 0) return pricePI
  
  const aX1 = Math.pow(clampedA, X - 1)
  const numerator = (PMAX - pricePI) * aX1 + pricePI * aN1 - PMAX
  const P = numerator / denominator
  
  return Math.round(Math.max(PMIN, Math.min(PMAX, P)) * 100) / 100
}

// Excel simulation: N=6, K=?, PMIN=50, PMAX=200, A=2, PI=80
// Expected: X=1:80, X=2:84, X=3:92, X=4:107, X=5:138, X=6:200

console.log("=== TEST K-DRIVEN FORMULA ===\n")

const N = 6, PMIN = 50, PMAX = 200, A = 2
const PI = 80 // From Excel (manually set or K=2)

console.log("Parameters: N=6, PMIN=50, PMAX=200, A=2, PI=80")
console.log("\nPrices per camera:")

const expectedPrices = [80, 84, 92, 107, 138, 200]
for (let X = 1; X <= N; X++) {
  const price = calculatePriceForCamera(N, 2, PMIN, PMAX, A, X, PI)
  const expected = expectedPrices[X - 1]
  const match = Math.round(price) === expected ? "OK" : "MISMATCH"
  console.log(`  X=${X}: ${price.toFixed(2)} (expected: ${expected}) ${match}`)
}

console.log("\n=== K VALUE TEST ===")
console.log(`To get PI=80 with PMIN=50, PMAX=200:`)
console.log(`K = ((PI - PMIN) / (PMAX - PMIN)) * 10`)
console.log(`K = ((80 - 50) / (200 - 50)) * 10`)
console.log(`K = (30 / 150) * 10 = 2`)
console.log(`\nSo K=2 gives PI=80`)

console.log("\n=== PI FOR DIFFERENT K VALUES ===")
for (let k = 0; k <= 10; k++) {
  const pi = calculatePI(k, PMIN, PMAX)
  console.log(`K=${k}: PI=${pi}`)
}
