import { expect, test } from '@playwright/test';
import { mockApi, submitDenverOmaha } from './support';

test('at 375 px the map, form and results are usable with no horizontal overflow', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await submitDenverOmaha(page);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  const map = await page.locator('[data-testid=maplibre-container]').boundingBox();
  expect(map?.height ?? 0).toBeGreaterThan(200);
  await expect(page.getByRole('list', { name: 'Route options' })).toBeVisible();

  // The slider and the Checkpoints button share the bottom of the map on phones; neither may cover the other.
  const slider = await page.getByRole('slider', { name: /Forecast frame/ }).boundingBox();
  const checkpoints = await page.getByRole('button', { name: /^Checkpoints \(\d+\)/ }).boundingBox();
  expect(slider).not.toBeNull();
  expect(checkpoints).not.toBeNull();
  const overlaps =
    slider!.x < checkpoints!.x + checkpoints!.width &&
    checkpoints!.x < slider!.x + slider!.width &&
    slider!.y < checkpoints!.y + checkpoints!.height &&
    checkpoints!.y < slider!.y + slider!.height;
  expect(overlaps).toBe(false);
});
