import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests (`npm run test:e2e`). Unit tests stay on `npm test`.
 *
 * Starts its own dev server on :3000 against a throwaway database
 * (tests/e2e/start-server.mts) — stop any other dev server first, or pick
 * another port with KK_E2E_PORT (e.g. when another checkout's dev server owns
 * :3000). The server
 * gets KK_E2E=1 and a fresh random KK_E2E_SECRET for this run only; it unlocks
 * the test-only sign-in route (app/lib/e2e-gate.ts). Tests read the same
 * secret from process.env.
 */
process.env.KK_E2E_SECRET ??= randomBytes(32).toString('hex');
process.env.KK_E2E_PORT ??= '3000';
const BASE_URL = `http://localhost:${process.env.KK_E2E_PORT}`;
process.env.KK_E2E_BASE = BASE_URL;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node tests/e2e/start-server.mts',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      KK_E2E: '1',
      KK_E2E_SECRET: process.env.KK_E2E_SECRET,
      KK_E2E_PORT: process.env.KK_E2E_PORT,
      // Dummy values so the Google button renders; tests stop the request before it leaves.
      GOOGLE_CLIENT_ID: 'e2e-dummy.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'e2e-dummy-not-a-secret',
    },
  },
});
