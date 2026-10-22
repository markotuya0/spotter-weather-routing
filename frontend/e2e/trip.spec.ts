import { expect, test, type Page } from '@playwright/test';
import { countColour, mockApi, submitDenverOmaha, type ApiCalls } from './support';

const ROUTE_GREEN: [number, number, number] = [0x2e, 0x8b, 0x57]; // risk "low", selected route
const ROUTE_MUTED: [number, number, number] = [0x5a, 0x6b, 0x77]; // unselected alternatives

/** Registers fixtures before navigation so the app never reaches the real backend. */
async function open(page: Page): Promise<ApiCalls> {
  const api = await mockApi(page);
  await page.goto('/');
  return api;
}

test('form shows required-field errors and accepts autocomplete selections', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Analyze trip' }).click();
  await expect(page.getByText('Choose an origin from the suggestions.')).toBeVisible();
  await expect(page.getByText('Choose a destination from the suggestions.')).toBeVisible();

  // Errors are recomputed on submit (not per keystroke), so a corrected field clears on the next submit.
  await page.getByRole('combobox', { name: 'Origin' }).fill('Denver, CO');
  await page.getByRole('option', { name: 'Denver, CO', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze trip' }).click();
  await expect(page.getByText('Choose an origin from the suggestions.')).toHaveCount(0);
  await expect(page.getByText('Choose a destination from the suggestions.')).toBeVisible();
});

/** The desktop checkpoint drawer is collapsed by default; its table only mounts once opened. */
async function openCheckpoints(page: Page) {
  await page.getByRole('button', { name: /^Checkpoints \(\d+\)/ }).click();
  return page.getByRole('table', { name: 'Checkpoints' });
}

test('a valid trip shows the recommendation and three route alternatives', async ({ page }) => {
  const api = await open(page);
  await submitDenverOmaha(page);

  await expect(page.getByText('Recommended: Route 1')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Route options' }).getByRole('listitem')).toHaveCount(3);
  expect(api.analyze).toBe(1);
});

test('the trip form collapses into a summary after analysis and expands via Edit trip without losing results', async ({ page }) => {
  await open(page);
  await submitDenverOmaha(page);

  // Full form fields are gone; a compact summary with an Edit control replaces them.
  await expect(page.getByRole('combobox', { name: 'Origin' })).toHaveCount(0);
  await expect(page.getByText('Denver, CO')).toBeVisible();
  await expect(page.getByText('Omaha, NE')).toBeVisible();
  const editButton = page.getByRole('button', { name: /edit trip/i });
  await expect(editButton).toBeVisible();

  await editButton.click();

  // The full form reappears, prefilled, and the existing results are still shown underneath.
  const originField = page.getByRole('combobox', { name: 'Origin' });
  await expect(originField).toBeVisible();
  await expect(originField).toHaveValue('Denver, CO');
  await expect(page.getByLabel('Load weight')).toHaveValue('38000');
  await expect(page.getByText('Recommended: Route 1')).toBeVisible();
});

test('the production map renders the routes without worker or tile errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Worker|tiles/i.test(msg.text())) errors.push(msg.text());
  });
  await open(page);
  await submitDenverOmaha(page);

  const canvas = page.locator('[data-testid=maplibre-container] canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByText(/Map tiles are unavailable/)).toHaveCount(0);

  // The selected route's risk colour and the muted alternatives must both be drawn on the WebGL canvas.
  await expect
    .poll(async () => countColour(page, await canvas.screenshot(), ROUTE_GREEN), { timeout: 20_000 })
    .toBeGreaterThan(100);
  expect(await countColour(page, await canvas.screenshot(), ROUTE_MUTED)).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test('selecting an alternative route and opening a checkpoint shows its details', async ({ page }) => {
  await open(page);
  await submitDenverOmaha(page);

  const routeItems = page.getByRole('list', { name: 'Route options' }).getByRole('listitem');
  await routeItems.nth(1).locator('button').first().click();
  await expect(routeItems.nth(1)).toHaveAttribute('aria-current', 'true');

  const table = await openCheckpoints(page);
  await table.locator('tbody tr').nth(3).click();
  await expect(page.getByText(/Mile \d+\.\d mi · ETA/)).toBeVisible();
});

test('forecast slider moves hours 0 and 48 with no API calls and no change to results', async ({ page }) => {
  const api = await open(page);
  await submitDenverOmaha(page);
  await expect(page.getByText(/Forecast frame: .* · \+0 h/)).toBeVisible();

  const recommendation = await page.getByText(/^Recommended: /).textContent();
  const table = await openCheckpoints(page);
  const checkpoints = await table.textContent();
  const before = { analyze: api.analyze, suggest: api.suggest };

  const slider = page.getByRole('slider', { name: /Forecast frame/ });
  await slider.focus();
  await slider.press('End');
  await expect(page.getByText(/Forecast frame: .* · \+48 h/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Conditions heatmap legend' })).toContainText('+48 h');

  await slider.press('Home');
  await expect(page.getByText(/Forecast frame: .* · \+0 h/)).toBeVisible();

  expect({ analyze: api.analyze, suggest: api.suggest }).toEqual(before);
  await expect(page.getByText(/^Recommended: /)).toHaveText(recommendation ?? '');
  await expect(table).toHaveText(checkpoints ?? '');
});
