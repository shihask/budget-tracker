import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:5173',
    // Mobile-first viewport to match the app's design target
    ...devices['iPhone 14'],
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // Auth setup runs first — logs in and saves session to disk
    {
      name: 'setup',
      testMatch: '**/auth.setup.ts',
    },
    // All other tests reuse the saved session
    {
      name: 'chromium',
      use: {
        ...devices['iPhone 14'],
        storageState: 'tests/.auth/session.json',
      },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
