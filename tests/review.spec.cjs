const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('node:url'),
  path = require('node:path');
const fixture = require('./fixtures.cjs');
const app = pathToFileURL(path.join(__dirname, '../index.html')).href;
const upload = (value, name = 'fixture.json') => ({
  name,
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(value))
});
test('review stays local, supports custom groups, persists partial captures, and protects owned servers', async ({
  page
}) => {
  const outbound = [],
    errors = [];
  page.on('request', (r) => {
    if (/^https?:/.test(r.url())) outbound.push(r.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(app);
  await expect(page.locator('#export')).toBeDisabled();
  const data = fixture.inventory();
  data.entries[0].name = '<img src=x onerror=alert(1)> Study Circle';
  await page.locator('#inventory-file').setInputFiles(upload(data));
  await expect(page.locator('#total')).toHaveText('3');
  await expect(page.locator('#friend-total')).toHaveText('1');
  await expect(page.locator('#images')).not.toBeChecked();
  await page.locator('#search').fill('Alex');
  await expect(page.locator('.server-row')).toHaveCount(1);
  await expect(page.locator('#detail h2 img')).toHaveCount(0);
  await page.locator('#notes').fill('A useful circle');
  await page.locator('[data-decision=keep]').click();
  page.once('dialog', (d) => d.accept('Friends · Study'));
  await page.locator('#new-group').click();
  await expect(page.locator('#topic-edit')).toHaveValue('Friends · Study');
  await page.reload();
  await expect(page.locator('#total')).toHaveText('3');
  await page.locator('#search').fill('A useful circle');
  await expect(page.locator('#notes')).toHaveValue('A useful circle');
  const partial = { ...data, entries: data.entries.slice(1) };
  await page.locator('#inventory-file').setInputFiles(upload(partial));
  await expect(page.locator('#total')).toHaveText('2');
  await page.reload();
  await page.locator('#inventory-file').setInputFiles(upload(data));
  await page.locator('#search').fill('A useful circle');
  await expect(page.locator('.server-row')).toHaveCount(1);
  await expect(page.locator('#notes')).toHaveValue('A useful circle');
  await page.locator('#search').fill('');
  await page.locator('[data-view=owned]').click();
  await expect(page.locator('[data-decision=leave]')).toBeDisabled();
  const download = page.waitForEvent('download');
  await page.locator('#export').click();
  const file = await download;
  const draft = JSON.parse(require('node:fs').readFileSync(await file.path(), 'utf8'));
  expect(draft.execution_authorized).toBe(false);
  expect(draft.account_id).toBe(fixture.ids.account);
  expect(outbound).toEqual([]);
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('demo uses synthetic data in a separate workspace and cannot become a real plan', async ({
  page
}) => {
  await page.goto(app + '?demo=1');
  await expect(page.locator('.safe-tag')).toContainText('Demo');
  await expect(page.locator('#total')).not.toHaveText('0');
  const download = page.waitForEvent('download');
  await page.locator('#export').click();
  const file = await download;
  const draft = JSON.parse(require('node:fs').readFileSync(await file.path(), 'utf8'));
  expect(draft.demo).toBe(true);
  expect(draft.execution_authorized).toBe(false);
  await expect(page.locator('#detail a[href^="https://discord.com"]')).toHaveCount(0);
});
