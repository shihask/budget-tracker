import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
})

test('FAB opens the quick-add sheet', async ({ page }) => {
  await page.getByRole('button', { name: 'Quick add' }).click()
  await expect(page.getByPlaceholder('e.g. Evening Tea')).toBeVisible()
})

test('quick-add sheet closes on close button', async ({ page }) => {
  await page.getByRole('button', { name: 'Quick add' }).click()
  await expect(page.getByTestId('sheet-backdrop')).toBeVisible()

  await page.getByRole('button', { name: 'Close' }).click()
  // Backdrop opacity goes to 0 — Playwright detects opacity:0 as hidden
  await expect(page.getByTestId('sheet-backdrop')).not.toBeVisible()
})

test('adds an expense transaction', async ({ page }) => {
  await page.getByRole('button', { name: 'Quick add' }).click()

  await page.getByPlaceholder('0').first().fill('150')
  await page.getByPlaceholder('e.g. Evening Tea').fill('Test Coffee')

  // Submit button text includes the amount once valid
  await page.getByRole('button', { name: /Save Expense/ }).click()

  // Sheet should close after saving
  await expect(page.getByTestId('sheet-backdrop')).not.toBeVisible()
})
