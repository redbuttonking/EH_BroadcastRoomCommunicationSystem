import { defineConfig } from '@playwright/test'

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '.cache/ms-playwright'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 7000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: [
    {
      command: 'npx firebase emulators:start --project demo-eh-broadcast --only auth,database',
      port: 9099,
      reuseExistingServer: process.env.EH_REUSE_LOCAL_SERVERS === 'true',
      timeout: 90_000,
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      env: { VITE_FIREBASE_EMULATORS: 'true' },
      reuseExistingServer: process.env.EH_REUSE_LOCAL_SERVERS === 'true',
    },
  ],
})
