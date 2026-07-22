/**
 * Test script to verify K-driven formula matches Excel simulation
 */

// Import the formula functions
import { calculatePI, calculatePriceForCamera, calculateKDrivenPrices, KDrivenParams } from '../lib/pricing/k-driven-formula'

// Excel simulation data
// N=6, K=7, PMIN=50, PMAX=200, A=2, PI=80
// Expected prices: X=1:80, X=2:84, X=3:92, X=4:107, X=5:138, X=6:200

const excelParams: KDrivenParams = {
  N: 6,
  K: 7,
  PMIN: 50,
  PMAX: 200,
  A: 2
}

console.log("=== TEST K-DRIVEN FORMULA ===\n")

// Test 1: Calculate PI with K=7
const calculatedPI = calculatePI({ K: 7, PMIN: 50, PMAX: 200 })
console.log(`PI calculated with K=7: ${calculatedPI}`)
console.log(`PI in Excel: 80`)
console.log(`Note: Excel shows PI=80, but formula with K=7 gives ${calculatedPI}`)
console.log(`To get PI=80, K should be: ${((80-50)/(200-50))*10}\n`)

// The Excel likely uses PI=80 directly, not calculated from K=7
// Let's verify the P formula with PI=80

console.log("=== VERIFYING P FORMULA WITH PI=80 ===\n")

// Override K to get PI=80 (K=2)
const correctParams: KDrivenParams = {
  N: 6,
  K: 2, // This gives PI=80
  PMIN: 50,
  PMAX: 200,
  A: 2
}

const result = calculateKDrivenPrices(correctParams)

console.log(`PI: ${result.PI}`)
console.log(`\nPrices per camera:`)
const expectedPrices = [80, 84, 92, 107, 138, 200]
result.prices.forEach((price, index) => {
  const expected = expectedPrices[index]
  const match = Math.round(price) === expected ? "✓" : "✗"
  console.log(`  X=${index + 1}: ${price.toFixed(2)} (expected: ${expected}) ${match}`)
})

console.log("\n=== FORMULA VERIFICATION ===")
console.log("\nFor X=1 with PI=80, N=6, A=2, PMAX=200:")
console.log("P = ((200-80) * 2^0 + 80 * 2^5 - 200) / (2^5 - 1)")
console.log("P = (120 * 1 + 80 * 32 - 200) / 31")
console.log("P = (120 + 2560 - 200) / 31")
console.log("P = 2480 / 31 = 80 ✓")

console.log("\nFor X=6 with PI=80, N=6, A=2, PMAX=200:")
console.log("P = ((200-80) * 2^5 + 80 * 2^5 - 200) / (2^5 - 1)")
console.log("P = (120 * 32 + 2560 - 200) / 31")
console.log("P = (3840 + 2560 - 200) / 31")
console.log("P = 6200 / 31 = 200 ✓")
