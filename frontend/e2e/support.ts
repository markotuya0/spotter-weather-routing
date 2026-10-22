import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

/** Recorded real backend responses (Denver → Omaha, 38,000 lb, 25 mi spacing). */
const fixtureDir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const fixture = (name: string) => JSON.parse(readFileSync(fixtureDir + name, 'utf8'));

export interface ApiCalls {
  analyze: number;
  suggest: number;
}

/** Deterministic API: serves recorded fixtures for every /api call and counts them. */
export async function mockApi(page: Page): Promise<ApiCalls> {
  const calls: ApiCalls = { analyze: 0, suggest: 0 };
  const analyzeBody = fixture('analyze-denver-omaha.json');
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/places/suggest')) {
      calls.suggest += 1;
      const q = url.searchParams.get('q') ?? '';
      const body = fixture(q.startsWith('Omaha') ? 'suggest-omaha.json' : 'suggest-denver.json');
      return route.fulfill({ json: body });
    }
    if (url.pathname.endsWith('/trips/analyze')) {
      calls.analyze += 1;
      return route.fulfill({ json: analyzeBody });
    }
    return route.fulfill({ status: 404, json: { error: { code: 'NOT_MOCKED', message: url.pathname } } });
  });
  return calls;
}

/** Departure two hours from now, as a `datetime-local` value (inside the API's 7-day window). */
export function departureLocal(): string {
  const d = new Date(Date.now() + 2 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Fills the trip form through the real autocomplete and submits it. */
export async function submitDenverOmaha(page: Page): Promise<void> {
  await page.getByRole('combobox', { name: 'Origin' }).fill('Denver, CO');
  await page.getByRole('option', { name: 'Denver, CO', exact: true }).click();
  await page.getByRole('combobox', { name: 'Destination' }).fill('Omaha, NE');
  await page.getByRole('option', { name: 'Omaha, NE (Douglas)' }).click();
  await page.getByLabel('Load weight').fill('38000');
  await page.getByLabel('Departure date and time').fill(departureLocal());
  await page.getByRole('button', { name: 'Analyze trip' }).click();
  await page.getByText(/^Recommended: /).waitFor();
}

/** Counts pixels in a PNG whose colour is within `tol` (L1 distance) of `rgb`. Decoded in the browser. */
export async function countColour(page: Page, png: Buffer, rgb: [number, number, number], tol = 40): Promise<number> {
  return page.evaluate(
    async ({ b64, target, tolerance }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        const d = Math.abs(data[i]! - target[0]) + Math.abs(data[i + 1]! - target[1]) + Math.abs(data[i + 2]! - target[2]);
        if (d < tolerance) n += 1;
      }
      return n;
    },
    { b64: png.toString('base64'), target: rgb, tolerance: tol },
  );
}
