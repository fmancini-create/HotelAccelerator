import { type Page, expect } from "@playwright/test"

/**
 * Login via the UI form and wait for dashboard redirect.
 */
export async function loginViaUI(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto("/auth/login")
  await page.locator("#email").fill(email)
  await page.locator("#password").fill(password)
  await page.locator('button[type="submit"]').click()
  // The login form POSTs to /api/auth/login which redirects to /dashboard
  await page.waitForURL("**/dashboard**", { timeout: 15_000 })
  await expect(page).toHaveURL(/\/dashboard/)
}
