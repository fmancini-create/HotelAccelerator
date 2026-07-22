import { test, expect } from "@playwright/test"
import { loginViaUI } from "./helpers/auth"

const EMAIL = process.env.E2E_TEST_EMAIL!
const PASSWORD = process.env.E2E_TEST_PASSWORD!

test.describe("Dashboard principale", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, EMAIL, PASSWORD)
  })

  test("la dashboard carica senza errori", async ({ page }) => {
    // Page loaded successfully (no crash, no redirect away)
    await expect(page).toHaveURL(/\/dashboard/)

    // The main content area should be visible
    const main = page.locator("main")
    await expect(main).toBeVisible({ timeout: 10_000 })
  })

  test("i KPI (Occupazione, ADR, RevPAR) sono visibili", async ({ page }) => {
    // Wait for dashboard data to load (KPIs are rendered after fetch)
    await page.waitForTimeout(3_000)

    // Check each KPI label is present somewhere on the page
    await expect(page.getByText("Occupazione").first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText("ADR").first()).toBeVisible({
      timeout: 5_000,
    })
    await expect(page.getByText("RevPAR").first()).toBeVisible({
      timeout: 5_000,
    })
  })

  test("l'indicatore di sync e' visibile", async ({ page }) => {
    // The SyncStatusIndicator renders a tooltip trigger with a status dot
    // and a time-ago label like "Xm fa", "Xh fa", or "Adesso"
    // It also renders an icon (CheckCircle2, AlertTriangle, or XCircle)

    // Wait for the sync status to load from /api/pms/last-sync
    await page.waitForTimeout(3_000)

    // Look for the time-ago text pattern or the status dot
    const syncIndicator = page.locator("button").filter({
      has: page.locator("span.rounded-full"),
    })
    // At least one sync indicator should be present (desktop or mobile)
    await expect(syncIndicator.first()).toBeVisible({ timeout: 10_000 })
  })

  test("non ci sono errori nella console del browser", async ({ page }) => {
    const consoleErrors: string[] = []

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text()
        // Ignore known non-critical errors
        if (
          text.includes("favicon") ||
          text.includes("hydration") ||
          text.includes("Loading chunk")
        ) {
          return
        }
        consoleErrors.push(text)
      }
    })

    // Navigate fresh to trigger any console errors
    await page.goto("/dashboard")
    await page.waitForTimeout(5_000)

    expect(consoleErrors).toEqual([])
  })
})
