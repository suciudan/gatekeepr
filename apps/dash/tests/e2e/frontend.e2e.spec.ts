import { test, expect } from '@playwright/test'

test.describe('Frontend', () => {
  test('sends visitors to the admin authentication page', async ({ page }) => {
    // Allow the first visit to compile and hydrate Payload's admin UI.
    test.setTimeout(90_000)
    await page.goto('/', { timeout: 60_000 })

    // An empty development database offers first-user setup; an initialized one offers login.
    await expect(page).toHaveURL(/\/admin\/(login|create-first-user)(?:[/?#]|$)/, { timeout: 60_000 })
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 30_000 })
  })
})
