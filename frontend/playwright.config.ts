import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// Runs against the production build served by `vite preview` (not the dev server).
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    command: `npx vite build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: [/mobile\.spec/, /live\.spec/],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile-375',
      testMatch: /mobile\.spec/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, hasTouch: true },
    },
    {
      // Real TomTom/Open-Meteo calls. Opt-in only: LIVE=1 with the backend running on 127.0.0.1:8000.
      name: 'live',
      testMatch: /live\.spec/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
});
