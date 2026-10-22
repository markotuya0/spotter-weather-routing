import { expect, test } from '@playwright/test';
import { submitDenverOmaha } from './support';

// Opt-in only: real TomTom/Open-Meteo calls through the local backend (LIVE=1, backend on 127.0.0.1:8000).
test.skip(!process.env.LIVE, 'live provider smoke test runs only with LIVE=1');

test('live providers: a real Denver → Omaha trip returns a recommendation and a mounted map', async ({ page }) => {
  await page.goto('/');
  await submitDenverOmaha(page);
  await expect(page.getByRole('list', { name: 'Route options' }).getByRole('listitem')).toHaveCount(3, {
    timeout: 60_000,
  });
  await expect(page.locator('[data-testid=maplibre-container] canvas')).toBeVisible();
});
