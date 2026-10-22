import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockApi, submitDenverOmaha } from './support';

async function open(page: Page) {
  await mockApi(page);
  await page.goto('/');
}

/** Serious and critical axe violations only; the spec gate is zero of these. */
async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5) }));
}

test('trip form has no serious or critical axe violations', async ({ page }) => {
  await open(page);
  expect(await seriousViolations(page)).toEqual([]);
});

test('populated results have no serious or critical axe violations', async ({ page }) => {
  await open(page);
  await submitDenverOmaha(page);
  await expect(page.getByRole('list', { name: 'Route options' })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test('map, heatmap toggle, legend and forecast slider have no serious or critical axe violations', async ({ page }) => {
  await open(page);
  await submitDenverOmaha(page);
  await expect(page.getByRole('region', { name: 'Conditions heatmap legend' })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test('open checkpoint details have no serious or critical axe violations', async ({ page }) => {
  await open(page);
  await submitDenverOmaha(page);
  await page.getByRole('button', { name: /^Checkpoints \(\d+\)/ }).click();
  await page.getByRole('table', { name: 'Checkpoints' }).locator('tbody tr').nth(3).click();
  await expect(page.getByRole('dialog', { name: 'Checkpoint details' })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});
