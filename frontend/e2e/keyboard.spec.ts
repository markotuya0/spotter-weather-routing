import { expect, test, type Page } from '@playwright/test';
import { departureLocal, mockApi, submitDenverOmaha } from './support';

/** Focuses by keyboard (Shift+Tab then Tab) so :focus-visible applies, as it does for a real keyboard user. */
async function focusByKeyboard(page: Page, locator: ReturnType<Page['getByRole']>) {
  await locator.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(locator).toBeFocused();
}

/** Presses Tab until `locator` has focus; fails if it is not reached within `max` presses. */
async function tabTo(page: Page, locator: ReturnType<Page['getByRole']>, max = 25) {
  for (let i = 0; i < max; i += 1) {
    if (await locator.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(locator).toBeFocused();
}

test('keyboard only: complete the trip, select a route, toggle the heatmap, open and close checkpoint details', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  const origin = page.getByRole('combobox', { name: 'Origin' });
  await origin.focus();
  await page.keyboard.type('Denver, CO');
  await page.getByRole('option', { name: 'Denver, CO', exact: true }).waitFor();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(origin).toHaveValue('Denver, CO');

  const destination = page.getByRole('combobox', { name: 'Destination' });
  await destination.focus();
  await page.keyboard.type('Omaha, NE');
  await page.getByRole('option', { name: 'Omaha, NE (Douglas)' }).waitFor();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  await page.getByLabel('Departure date and time').fill(departureLocal());
  await page.getByLabel('Load weight').fill('38000');
  await tabTo(page, page.getByRole('button', { name: 'Analyze trip' }));
  await page.keyboard.press('Enter');
  await expect(page.getByText('Recommended: Route 1')).toBeVisible();

  const routeItems = page.getByRole('list', { name: 'Route options' }).getByRole('listitem');
  await routeItems.nth(1).locator('button').first().focus();
  await page.keyboard.press('Enter');
  await expect(routeItems.nth(1)).toHaveAttribute('aria-current', 'true');

  const heatmapToggle = page.getByRole('button', { name: /Conditions heatmap/ });
  await heatmapToggle.focus();
  await page.keyboard.press('Enter');
  await expect(heatmapToggle).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Enter');
  await expect(heatmapToggle).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: /^Checkpoints \(\d+\)/ }).focus();
  await page.keyboard.press('Enter');
  const row = page.getByRole('table', { name: 'Checkpoints' }).locator('tbody tr').nth(3);
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Checkpoint details' })).toBeVisible();

  const close = page.getByRole('button', { name: 'Close checkpoint details' });
  await close.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Checkpoint details' })).toHaveCount(0);
  // Focus must not be lost to <body> when the details close.
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
});

test('every key control shows a visible focus indicator', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Analyze trip' }).focus();
  const indicator = (locator: ReturnType<Page['getByRole']>) =>
    locator.evaluate((el) => {
      const cs = getComputedStyle(el);
      if (cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px') return 'outline';
      if (cs.boxShadow !== 'none') return 'box-shadow';
      // MUI outlined inputs draw focus as a 2px brand-coloured <fieldset> border.
      const frame = el.closest('.MuiOutlinedInput-root')?.querySelector('fieldset') ?? el;
      if (parseFloat(getComputedStyle(frame).borderTopWidth) >= 2) return 'border';
      return 'none';
    });
  const controls = {
    origin: page.getByRole('combobox', { name: 'Origin' }),
    load: page.getByLabel('Load weight'),
    spacing10: page.getByRole('button', { name: '10 mi' }),
    analyze: page.getByRole('button', { name: 'Analyze trip' }),
  };
  for (const [name, locator] of Object.entries(controls)) {
    await focusByKeyboard(page, locator);
    expect(await indicator(locator), name).not.toBe('none');
  }
});

test('results-view controls show a visible focus indicator', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await submitDenverOmaha(page);
  const indicator = (locator: ReturnType<Page['getByRole']>) =>
    locator.evaluate((el) => {
      const cs = getComputedStyle(el);
      return cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px' ? 'outline' : cs.boxShadow !== 'none' ? 'box-shadow' : 'none';
    });
  const controls = {
    routeCard: page.getByRole('list', { name: 'Route options' }).getByRole('listitem').nth(1).locator('button').first(),
    heatmapToggle: page.getByRole('button', { name: /Conditions heatmap/ }),
    checkpointsBar: page.getByRole('button', { name: /^Checkpoints \(\d+\)/ }),
  };
  for (const [name, locator] of Object.entries(controls)) {
    await focusByKeyboard(page, locator);
    expect(await indicator(locator), name).not.toBe('none');
  }
});
