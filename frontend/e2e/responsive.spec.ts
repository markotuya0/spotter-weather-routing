import { expect, test } from '@playwright/test';
import { mockApi, submitDenverOmaha } from './support';

for (const width of [320, 360, 768, 1280]) {
  test(`at ${width}px the results have no horizontal overflow, a usable map, and no overlapping controls`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockApi(page);
    await page.goto('/');
    await submitDenverOmaha(page);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(0);

    const map = await page.locator('[data-testid=maplibre-container]').boundingBox();
    expect(map?.height ?? 0, 'map height').toBeGreaterThan(200);

    const slider = await page.getByRole('slider', { name: /Forecast frame/ }).boundingBox();
    const checkpoints = await page.getByRole('button', { name: /^Checkpoints \(\d+\)/ }).boundingBox();
    expect(slider && checkpoints).toBeTruthy();
    const overlaps =
      slider!.x < checkpoints!.x + checkpoints!.width &&
      checkpoints!.x < slider!.x + slider!.width &&
      slider!.y < checkpoints!.y + checkpoints!.height &&
      checkpoints!.y < slider!.y + slider!.height;
    expect(overlaps, 'slider overlaps checkpoints control').toBe(false);
  });
}
