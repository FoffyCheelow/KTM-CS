import {test, expect} from '@playwright/test';
import {request} from '../fixtures.ts';

test('planner uses whole-number areas and accepts an adjoining-zone proposal explicitly', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', {name: 'Studio planner', exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: /Zone 4,.*proposed/})).toBeVisible();
  await expect(page.getByText(/11 m² more space needed/).first()).toBeVisible();
  await page.getByRole('button', {name: /Add Zone (3|8)/}).first().click();
  await expect(page.getByRole('main').getByText('Requires review', {exact: true}).first()).toBeVisible();
  await page.getByLabel('Activity name', {exact: true}).fill('Browser smoke workshop');
  await page.getByRole('button', {name: 'Save draft', exact: true}).click();
  const details = page.getByRole('dialog', {name: 'Activity details'});
  await expect(details).toBeVisible();
  await expect(details.getByRole('heading', {name: 'Browser smoke workshop'})).toBeVisible();
  await details.getByLabel('Close dialog').click();
  await page.reload();
  await page.getByRole('button', {name: /^Bookings/}).click();
  await expect(page.getByText('Browser smoke workshop', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Studio settings', exact: true}).click();
  await expect(page.getByRole('dialog', {name: 'Studio settings'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('meeting preference and keyboard zone selection work', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name: 'Meeting', exact: true}).click();
  await expect(page.getByRole('button', {name: /Zone 7,.*proposed/})).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', {name: /Zone 8,/}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Your selection', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Auto-select', exact: true}).click();
  await expect(page.getByRole('button', {name: /Zone 7,.*proposed/})).toHaveAttribute('aria-pressed', 'true');
});

test('screening always includes Zone 3, limits adjoining zones and reserves projection equipment', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name: 'Screening', exact: true}).click();
  await expect(page.getByRole('button', {name: /Zone 3,.*proposed/})).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Activity name', {exact: true}).fill('Browser screening');
  await page.getByRole('button', {name: 'Save draft', exact: true}).click();
  const details = page.getByRole('dialog', {name: 'Activity details'});
  await expect(details.getByRole('heading', {name: 'Browser screening'})).toBeVisible();
  const state = await (await page.request.get('/api/state')).json();
  const screening = state.bookings.find((booking: {name: string}) => booking.name === 'Browser screening');
  expect(screening.zones).toContain(3);
  expect(screening.zones.every((zone: number) => [2, 3, 4].includes(zone))).toBe(true);
  expect((screening.equipment.Projector || 0) + (screening.equipment.Screen || 0)).toBeGreaterThan(0);
});

test('storage request records items and inclusive dates and survives reload', async ({page}) => {
  await page.goto('/');
  await page.getByRole('complementary').getByRole('button', {name: 'Request storage', exact: true}).click();
  await page.getByLabel('Items to store', {exact: true}).fill('Browser test flat-packed display boards');
  await page.getByLabel('From date', {exact: true}).fill('2030-02-01');
  await page.getByLabel('Until date', {exact: true}).fill('2030-02-08');
  const saved = page.waitForResponse(response => response.url().endsWith('/api/storage') && response.request().method() === 'POST');
  await page.getByRole('button', {name: 'Submit storage request', exact: true}).click();
  expect((await saved).status()).toBe(201);
  await page.reload();
  await page.getByRole('button', {name: /^Bookings/}).click();
  await expect(page.getByText('Browser test flat-packed display boards', {exact: true}).first()).toBeVisible();
  const state = await (await page.request.get('/api/state')).json();
  const stored = state.storageRequests.find((entry: {items: string}) => entry.items === 'Browser test flat-packed display boards');
  expect(stored.startDate).toBe('2030-02-01');
  expect(stored.endDate).toBe('2030-02-08');
  expect(stored.status).toBe('pending');
  expect(stored.reviewRequired).toBe(true);
});

test('simplified desktop and mobile interfaces omit the guide and removed form fields', async ({page}) => {
  for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', {name: 'Studio planner', exact: true})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Studio guide', exact: true})).toHaveCount(0);
    for (const label of ['Layout', 'Classification', 'Accessibility / spatial requirements', 'Minimum area', 'Practical layout', 'Notes', 'People present from', 'People present until']) {
      await expect(page.getByLabel(label, {exact: true})).toHaveCount(0);
    }
    await expect(page.getByText(/Make room for/)).toHaveCount(0);
    await expect(page.getByText(/222\.97/)).toHaveCount(0);
    const widths = await page.evaluate(() => ({body: document.body.scrollWidth, viewport: window.innerWidth}));
    expect(widths.body).toBeLessThanOrEqual(widths.viewport);
    await page.getByRole('complementary').getByRole('button', {name: 'Request storage', exact: true}).click();
    await expect(page.getByLabel('Items to store', {exact: true})).toBeVisible();
  }
  expect((await page.request.get('/references/floor-plan.pdf')).status()).toBe(200);
});

test('manager can record verification, save settings and confirm a valid request', async ({page}) => {
  await page.goto('/');
  await page.getByLabel('Manager sign in', {exact: true}).click();
  await page.getByLabel('Manager password', {exact: true}).fill('browser-test-password-only');
  await page.getByRole('button', {name: 'Sign in', exact: true}).click();
  const settings = page.getByRole('dialog', {name: 'Studio settings'});
  await expect(settings).toBeVisible();
  await page.getByRole('spinbutton', {name: 'Whole studio', exact: true}).fill('60');
  await page.getByRole('spinbutton', {name: 'Shared escape routes', exact: true}).fill('60');
  await settings.locator('.factor-row').filter({hasText: 'Meeting'}).getByRole('checkbox').check();
  await page.getByLabel('Site assessment / approval reference', {exact: true}).fill('TEST ONLY — browser verification reference. Not an operational approval.');
  await page.getByRole('checkbox', {name: /Site fire strategy, practical layout/}).check();
  await settings.getByRole('button', {name: 'Zones & connections', exact: true}).click();
  await page.getByLabel('Known length (m)', {exact: true}).fill('10');
  await page.getByLabel('Drawing span (units)', {exact: true}).fill('100');
  await page.getByRole('button', {name: 'Save settings', exact: true}).click();
  await expect(settings.getByText('Rule version 2', {exact: true})).toBeVisible();
  await settings.getByLabel('Close dialog').click();
  await expect(page.locator('.dimension-summary')).toContainText('≈ 23.6 m × 38.6 m');
  const response = await page.request.post('/api/bookings', {data: {request: request({name: 'Manager confirmation flow', type: 'meeting', classification: 'meeting', participants: 5}), zones: [7], status: 'pending'}});
  expect(response.status()).toBe(201);
  await page.reload();
  await page.getByRole('button', {name: /^Bookings/}).click();
  await page.getByRole('button').filter({hasText: 'Manager confirmation flow'}).click();
  const details = page.getByRole('dialog', {name: 'Activity details'});
  await expect(details).toContainText('≈ 11.8 m × 15.4 m');
  await expect(details.getByRole('button', {name: 'Confirm booking', exact: true})).toBeEnabled();
  await details.getByRole('button', {name: 'Confirm booking', exact: true}).click();
  await expect(details.getByText('confirmed', {exact: true})).toBeVisible();
  await details.getByLabel('Close dialog').click();
  await page.reload();
  await page.getByRole('button', {name: /^Bookings/}).click();
  await expect(page.getByRole('button').filter({hasText: 'Manager confirmation flow'})).toContainText('confirmed');
});
