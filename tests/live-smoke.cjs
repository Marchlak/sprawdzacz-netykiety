// Optional real-page check: only type neutral text; NEVER click send or press Enter.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const {mkdtemp, rm, mkdir} = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const extension = path.resolve(__dirname, '../extension');
const id = createHash('sha256').update(extension).digest('hex').slice(0, 32)
  .replace(/[0-9a-f]/g, digit => String.fromCharCode(97 + parseInt(digit, 16)));

(async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'twitch-guard-live-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.BRAVE_PATH || '/usr/bin/brave-browser',
      headless: !process.env.HEADED,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-sandbox'],
      viewport: {width: 1100, height: 850}
    });
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.locator('#terms:not([disabled])').waitFor();
    await popup.evaluate(() => chrome.storage.local.set({twitchGuardConfig: {version: 1, terms: ['mak']}}));
    const page = await context.newPage();
    for (const url of ['https://www.twitch.tv/popout/twitch/chat?popout=', 'https://www.twitch.tv/twitch']) {
      await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 60000});
      const editor = page.locator('[data-a-target="chat-input"]').first();
      await editor.waitFor({timeout: 60000});
      const button = page.locator('[data-a-target="chat-send-button"]').first();
      try {
        await editor.fill('MA.K');
        await page.waitForFunction(() => document.querySelector('[data-a-target="chat-send-button"]')?.getAttribute('data-twitch-guard-blocked') === 'true');
        assert.match(await page.locator('.twitch-guard-warning').first().innerText(), /mak/);
        const background = await button.evaluate(element => getComputedStyle(element).backgroundColor);
        assert.equal(background, 'rgb(85, 84, 93)');
        await mkdir(path.resolve(__dirname, '../test-results'), {recursive: true});
        await page.screenshot({path: path.resolve(__dirname, `../test-results/live-${url.includes('popout') ? 'popout' : 'channel'}-blocked.png`)});
        await editor.fill('rower');
        await page.waitForFunction(() => !document.querySelector('[data-a-target="chat-send-button"]')?.hasAttribute('data-twitch-guard-blocked'));
        console.log(`PASS: neutral typing, grey button, warning and recovery: ${url}`);
      } finally {
        await editor.fill('');
      }
    }
    console.log('No messages sent. Temporary list and browser profile are discarded.');
  } finally {
    if (context) await context.close();
    await rm(profile, {recursive: true, force: true});
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
