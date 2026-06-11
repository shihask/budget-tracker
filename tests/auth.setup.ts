import { test as setup } from '@playwright/test'

// Logs in once and saves session to disk. All other tests reuse this.
// Run automatically before the 'chromium' project via playwright.config.ts dependencies.
setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_EMAIL
  const password = process.env.TEST_PASSWORD

  if (!email || !password) {
    throw new Error(
      'Set TEST_EMAIL and TEST_PASSWORD in .env.test before running tests'
    )
  }

  await page.goto('/')

  // Fill in login form
  await page.getByPlaceholder('you@example.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  // Two "Sign In" buttons exist: the tab toggle and the submit button — use last()
  await page.getByRole('button', { name: 'Sign In' }).last().click()

  // Wait until the dashboard loads (AuthPage disappears)
  await page.waitForSelector('text=MoneyPlant', { state: 'hidden', timeout: 15000 })
    .catch(() => {})
  // Give the app a moment to finish loading data
  await page.waitForTimeout(2000)

  // Save the full localStorage + cookies so other tests can skip login
  await page.context().storageState({ path: 'tests/.auth/session.json' })
})
