import { test, expect } from "@playwright/test"
import { loginViaUI } from "./helpers/auth"

const EMAIL = process.env.E2E_TEST_EMAIL!
const PASSWORD = process.env.E2E_TEST_PASSWORD!

test.describe("Autenticazione", () => {
  test("un utente non loggato che visita /dashboard viene reindirizzato a /auth/login", async ({
    page,
  }) => {
    await page.goto("/dashboard")
    await page.waitForURL("**/auth/login**", { timeout: 10_000 })
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test("il login con credenziali errate mostra un messaggio di errore", async ({
    page,
  }) => {
    await page.goto("/auth/login")
    await page.locator("#email").fill("utente-inesistente@test.invalid")
    await page.locator("#password").fill("password-sbagliata-12345")
    await page.locator('button[type="submit"]').click()

    // The login route redirects back to /auth/login?error=... on failure
    await page.waitForURL("**/auth/login?error=**", { timeout: 10_000 })

    // The error message is rendered in a red box
    const errorBox = page.locator(".bg-red-50")
    await expect(errorBox).toBeVisible({ timeout: 5_000 })
    await expect(errorBox).not.toBeEmpty()
  })

  test("il login con credenziali corrette porta alla dashboard", async ({
    page,
  }) => {
    await loginViaUI(page, EMAIL, PASSWORD)
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test("il logout riporta alla pagina iniziale", async ({ page }) => {
    // First login
    await loginViaUI(page, EMAIL, PASSWORD)

    // Logout navigates to /api/auth/logout-now which redirects to /
    await page.goto("/api/auth/logout-now")
    await page.waitForURL("**/", { timeout: 10_000 })

    // After logout, visiting /dashboard should redirect to login
    await page.goto("/dashboard")
    await page.waitForURL("**/auth/login**", { timeout: 10_000 })
    await expect(page).toHaveURL(/\/auth\/login/)
  })
})
