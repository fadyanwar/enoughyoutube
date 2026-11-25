// Loads the unpacked dist/chrome build into headed Chromium (run under
// xvfb-run on a server) and checks the extension against a local stand-in
// for YouTube and YouTube Kids. No request leaves the machine: every
// navigation is answered by Playwright from tests/fixtures or refused.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build } from '../scripts/build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = fs.readFileSync(path.join(root, 'tests', 'fixtures', 'youtube.html'), 'utf8');
const FAKE_SITES = /^https:\/\/(www\.|m\.)?(youtube\.com|youtubekids\.com|youtu\.be)\//;
const OTHER_SITE = 'https://example.org/';
const { dir } = build('chrome');

const profile = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'ey-chrome-'));
const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  args: [
    `--disable-extensions-except=${dir}`,
    `--load-extension=${dir}`,
    // Nothing may resolve on the real network, even if a route is missed.
    '--host-resolver-rules=MAP * ~NOTFOUND',
    '--no-first-run',
  ],
});
const steps = [];
const step = name => { steps.push(name); console.log(`ok - ${name}`); };
try {
  await context.route(/^https?:/, route => {
    const url = route.request().url();
    if (FAKE_SITES.test(url)) return route.fulfill({ contentType: 'text/html', body: fixture });
    if (url === OTHER_SITE) return route.fulfill({ contentType: 'text/html', body: '<title>Other site</title><p>Not YouTube</p>' });
    return route.abort();
  });

  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const extensionUrl = file => `chrome-extension://${extensionId}/${file}`;
  const blockUrl = extensionUrl('block.html');
  const state = () => worker.evaluate(() => chrome.storage.local.get(['usage', 'dailyLimitMinutes']));
  const update = () => worker.evaluate(() => scheduleUpdate());
  step(`service worker started (${worker.url()})`);

  // Options page: save a one-minute allowance.
  const options = await context.newPage();
  await options.goto(extensionUrl('options.html'));
  await options.locator('#minutes:enabled').fill('1');
  await options.click('#save');
  await options.locator('#status', { hasText: 'Saved: 1 minute per day.' }).waitFor();
  assert.equal((await state()).dailyLimitMinutes, 1);
  step('options page saves the daily limit');

  // Parent PIN: once set, the limit cannot change without it.
  await options.fill('#new-pin', '2468');
  await options.click('#set-pin');
  await options.locator('#pin-status', { hasText: 'PIN saved' }).waitFor();
  const record = (await worker.evaluate(() => chrome.storage.local.get('parentPin'))).parentPin;
  assert.match(record.hash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(record).includes('2468'), 'PIN stored only as a hash');
  await options.reload();
  await options.locator('#pin-check').waitFor();
  await options.locator('#minutes:enabled').fill('30');
  await options.fill('#pin', '1111');
  await options.click('#save');
  await options.locator('#status', { hasText: 'That PIN is not right' }).waitFor();
  assert.equal((await state()).dailyLimitMinutes, 1, 'wrong PIN keeps the limit');
  await options.locator('#minutes').fill('1');
  await options.fill('#pin', '2468');
  await options.click('#save');
  await options.locator('#status', { hasText: 'Saved: 1 minute per day.' }).waitFor();
  step('parent PIN is hashed and required to change the limit');
  await options.close();

  // A non-YouTube tab is never counted or redirected.
  const page = await context.newPage();
  await page.goto(OTHER_SITE);
  await page.bringToFront();
  await update();
  assert.equal((await state()).usage.since, null, 'other sites do not count');
  step('other sites are not counted');

  // The YouTube stand-in counts time and keeps loading suggestions; the
  // content script prints the shared countdown in the page console.
  const pageLogs = [];
  page.on('console', message => pageLogs.push(message.text()));
  await page.goto('https://www.youtube.com/watch?v=test');
  await page.bringToFront();
  await update();
  const counting = (await state()).usage;
  assert.ok(counting.since, `timer counts on YouTube: ${JSON.stringify(counting)}`);
  await page.locator('#related .video').nth(4).waitFor();
  step('YouTube tab counts time while suggestions load dynamically');
  const deadline = Date.now() + 8000;
  while (!pageLogs.some(line => /\[Enough YouTube timer\] counting \| \d+s remaining/.test(line)) && Date.now() < deadline) {
    await page.waitForTimeout(250);
  }
  assert.ok(pageLogs.some(line => line.includes('Page diagnostics loaded')), `content script loaded: ${pageLogs.join(' / ')}`);
  assert.ok(pageLogs.some(line => /counting \| \d+s remaining/.test(line)), 'content script prints countdown');
  step('content script prints the countdown in the page console');

  // Leave 3 seconds of allowance; the alarm must redirect the tab by itself.
  await worker.evaluate(() => chrome.storage.local.set({ usage: { day: dayKey(Date.now()), elapsed: 57000, since: null } }));
  await update();
  const started = Date.now();
  await page.waitForURL(blockUrl, { timeout: 45000 });
  step(`deadline alarm redirected YouTube to the break page after ${((Date.now() - started) / 1000).toFixed(1)}s`);
  const usage = (await state()).usage;
  assert.ok(usage.elapsed >= 60000 && usage.since === null, JSON.stringify(usage));
  await page.locator('#limit-message', { hasText: 'You have watched YouTube for 1 minute today' }).waitFor();
  assert.match(await page.locator('#limit-message').textContent(), /time to study/);
  const idea = await page.locator('#idea').textContent();
  assert.ok(idea && !idea.startsWith('Let’s find'), 'an activity idea is shown');
  assert.equal(await page.locator('.footer').evaluate(el => getComputedStyle(el).marginTop), '28px', 'footer styled');
  step('break page shows the limit, the study reminder and an activity idea');

  // Further visits the same day, including YouTube Kids, are blocked.
  const kids = await context.newPage();
  await kids.goto('https://www.youtubekids.com/').catch(() => {});
  await kids.waitForURL(blockUrl, { timeout: 10000 });
  step('new YouTube Kids visit after the limit is redirected');

  // "Close this tab" closes a tab that has history (#2).
  assert.ok(await kids.evaluate(() => history.length) > 1);
  const closed = kids.waitForEvent('close', { timeout: 5000 });
  await kids.click('#close', { noWaitAfter: true }).catch(() => {});
  await closed;
  step('"Close this tab" closes the break-page tab');

  // Raising the limit allows YouTube again without clearing usage.
  const before = (await state()).usage.elapsed;
  await worker.evaluate(() => chrome.storage.local.set({ dailyLimitMinutes: 60 }));
  await page.goto('https://www.youtube.com/watch?v=test');
  await page.bringToFront();
  await update();
  await page.waitForTimeout(500);
  assert.equal(new URL(page.url()).host, 'www.youtube.com');
  assert.ok((await state()).usage.elapsed >= before, 'usage preserved');
  step('raising the limit permits YouTube again and keeps usage');

  console.log(`PASS (Chromium ${context.browser()?.version() ?? ''}): ${steps.length} checks with the unpacked Chrome build.`);
} finally {
  await context.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
