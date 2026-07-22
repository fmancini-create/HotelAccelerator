import { test, expect } from "@playwright/test"

const HOTEL_ID = process.env.E2E_TEST_HOTEL_ID!
const OTHER_HOTEL_ID = process.env.E2E_OTHER_HOTEL_ID!

test.describe("Sicurezza API", () => {
  test("chiamata a /api/dashboard/metrics senza token ritorna 401", async ({
    request,
  }) => {
    // Call the API without any auth cookies/headers
    const res = await request.get(
      `/api/dashboard/metrics?hotel_id=${HOTEL_ID}`
    )
    expect(res.status()).toBe(401)

    const body = await res.json()
    expect(body.error).toBeTruthy()
  })

  test("chiamata a /api/dashboard/metrics con hotelId diverso ritorna 403", async ({
    page,
    request,
  }) => {
    // First, login via the UI to get valid auth cookies
    await page.goto("/auth/login")
    await page.locator("#email").fill(process.env.E2E_TEST_EMAIL!)
    await page.locator("#password").fill(process.env.E2E_TEST_PASSWORD!)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL("**/dashboard**", { timeout: 15_000 })

    // Extract cookies from the authenticated browser context
    const cookies = await page.context().cookies()
    const cookieHeader = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ")

    // Call the API with the authenticated user's cookies but a DIFFERENT hotel_id
    const res = await request.get(
      `/api/dashboard/metrics?hotel_id=${OTHER_HOTEL_ID}`,
      {
        headers: {
          Cookie: cookieHeader,
        },
      }
    )

    // Should be 403 Forbidden (user doesn't have access to this hotel)
    expect(res.status()).toBe(403)

    const body = await res.json()
    expect(body.error).toBeTruthy()
  })
})
