const {test} = require('node:test');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {mkdtemp, readFile, rm, mkdir} = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const EXTENSION = path.resolve(__dirname, '../extension');
const INPUT = '[data-a-target="chat-input"]';
const BUTTON = '[data-a-target="chat-send-button"]';
const MARK = 'data-twitch-guard-blocked';
const KEY = 'twitchGuardConfig';
const extensionId = createHash('sha256').update(EXTENSION).digest('hex').slice(0, 32)
  .replace(/[0-9a-f]/g, digit => String.fromCharCode(97 + parseInt(digit, 16)));

async function eventually(check, message = 'condition did not settle') {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  assert.fail(message);
}

async function blocked(page, expected) {
  await eventually(async () => (await page.locator(BUTTON).getAttribute(MARK) === 'true') === expected,
    `expected blocked=${expected}`);
}

async function edit(page, text) {
  await page.locator(INPUT).fill(text);
}

async function clickAt(page, selector) {
  const box = await page.locator(selector).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test('installed extension in an isolated Brave profile', {timeout: 120000}, async t => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'twitch-guard-test-'));
  const fixture = await readFile(path.join(__dirname, 'fixtures/chat.html'), 'utf8');
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.BRAVE_PATH || '/usr/bin/brave-browser',
      headless: !process.env.HEADED,
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`, '--no-sandbox'],
      viewport: {width: 1100, height: 850}
    });
    // No requests reach Twitch in the fixture tests, but the real manifest and isolated content scripts run.
    await context.route('https://www.twitch.tv/guard-fixture**', route => route.fulfill({contentType: 'text/html', body: fixture}));
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.locator('#terms:not([disabled])').waitFor();
    const setTerms = terms => popup.evaluate(({KEY, terms}) => chrome.storage.local.set({[KEY]: {version: 1, terms}}), {KEY, terms});
    await setTerms(['mak']);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://www.twitch.tv/guard-fixture');
    await page.locator('.twitch-guard-warning').waitFor({state: 'attached'});

    await t.test('typing, neutral blocked fragments, paste, and real pointer/Enter protection', async () => {
      await edit(page, 'rower');
      await blocked(page, false);
      await page.locator(INPUT).press('Enter');
      await clickAt(page, BUTTON);
      assert.equal(await page.evaluate(() => sent.length), 2);
      for (const text of ['gucioMak', 'M A K', 'ma.k', 'm4k', 'm\u200ba\u2060k']) {
        await edit(page, text);
        await blocked(page, true);
        await page.locator(INPUT).press('Enter');
        await clickAt(page, BUTTON + ' span');
        assert.equal(await page.evaluate(() => sent.length), 2, text);
      }
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: 'https://www.twitch.tv'});
      await edit(page, '');
      await page.evaluate(() => navigator.clipboard.writeText('MA.K'));
      await page.locator(INPUT).focus();
      await page.keyboard.press('Control+V');
      await blocked(page, true);
      assert.equal(await page.locator(INPUT).innerText(), 'MA.K');
      await page.locator(INPUT).press('Enter');
      assert.equal(await page.evaluate(() => sent.length), 2);
      await page.evaluate(() => {
        const editor = document.querySelector('[contenteditable]');
        editor.textContent = 'MA.K';
        editor.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertFromPaste', data: 'MA.K'}));
        editor.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, cancelable: true, key: 'Enter'}));
      });
      assert.equal(await page.evaluate(() => sent.length), 2);
      assert.match(await page.locator('.twitch-guard-warning').innerText(), /mak/);
      await edit(page, 'rower');
      await blocked(page, false);
      await page.locator(INPUT).press('Enter');
      assert.equal(await page.evaluate(() => sent.length), 3);
    });

    await t.test('synchronous recheck, emote image names, and form submit interception', async () => {
      const before = await page.evaluate(() => sent.length);
      await page.evaluate(() => {
        const editor = document.querySelector('[contenteditable]');
        editor.innerHTML = '<span>gucio</span><img alt="Mak" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">';
        // No input event; guard must read the current DOM synchronously.
        document.querySelector('[data-a-target="chat-send-button"]').click();
        document.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
      });
      await blocked(page, true);
      assert.equal(await page.evaluate(() => sent.length), before);
      await edit(page, 'rower');
      await blocked(page, false);
    });

    await t.test('native disabled state and original ARIA are preserved', async () => {
      await page.locator(BUTTON).evaluate(button => {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
      });
      await edit(page, 'mak');
      await blocked(page, true);
      await edit(page, 'rower');
      await blocked(page, false);
      assert.equal(await page.locator(BUTTON).isDisabled(), true);
      assert.equal(await page.locator(BUTTON).getAttribute('aria-disabled'), 'true');
      await page.locator(BUTTON).evaluate(button => {button.disabled = false; button.removeAttribute('aria-disabled');});
    });

    await t.test('replaced editor and button get one working warning and guard', async () => {
      await page.evaluate(() => {
        const root = document.querySelector('.chat-input');
        root.innerHTML = '<div role="textbox" data-a-target="chat-input" contenteditable="true">mak</div><button type="button" data-a-target="chat-send-button">Rozmawiaj</button>';
      });
      await blocked(page, true);
      await eventually(async () => await page.locator('.twitch-guard-warning').count() === 1);
      const before = await page.evaluate(() => sent.length);
      await page.locator(INPUT).press('Enter');
      assert.equal(await page.evaluate(() => sent.length), before);
      await page.locator(BUTTON).evaluate(button => {
        button.removeAttribute('data-twitch-guard-blocked');
        button.removeAttribute('aria-disabled');
      });
      await blocked(page, true);
      assert.equal(await page.locator(BUTTON).getAttribute('aria-disabled'), 'true');
    });

    await t.test('popup cleans, saves, and broadcasts settings to multiple tabs', async () => {
      const second = await context.newPage();
      await second.goto('https://www.twitch.tv/guard-fixture?second');
      await edit(second, 'mak');
      await blocked(second, true);
      await popup.locator('#terms').fill('rower\nROWER\n!!!\n');
      await popup.locator('#save').click();
      await eventually(async () => (await popup.locator('#status').innerText()).startsWith('Zapisano.'));
      assert.equal(await popup.locator('#terms').inputValue(), 'rower');
      await blocked(page, false);
      await blocked(second, false);
      await edit(second, 'rower');
      await blocked(second, true);
      await setTerms([]);
      await blocked(second, false);
      await eventually(async () => (await popup.locator('#terms').inputValue()) === '');
      await second.close();
    });

    await t.test('invalid settings fail closed and a valid save recovers the open tab', async () => {
      await popup.evaluate(KEY => chrome.storage.local.set({[KEY]: {version: 123, terms: []}}), KEY);
      await blocked(page, true);
      assert.match(await page.locator('.twitch-guard-warning').innerText(), /nie można odczytać/);
      await setTerms(['mak']);
      await edit(page, 'rower');
      await blocked(page, false);
      await page.locator('#unrelated').fill('mak');
      const allowed = await page.locator('#unrelated').evaluate(input => input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true})));
      assert.equal(allowed, true);
    });

    await t.test('reset is a draft until saved; empty list is explicitly supported', async () => {
      await popup.locator('#reset').click();
      assert.match(await popup.locator('#status').innerText(), /przygotowana/);
      const terms = await popup.evaluate(KEY => chrome.storage.local.get(KEY).then(result => result[KEY].terms), KEY);
      assert.deepEqual(terms, ['mak']);
      await popup.locator('#terms').fill('');
      await popup.locator('#save').click();
      await eventually(async () => (await popup.locator('#status').innerText()).includes('pustą listę'));
      await edit(page, 'mak');
      await blocked(page, false);
    });

    await t.test('delayed and failed storage reads block sending (controlled API fixture)', async () => {
      const scripts = await Promise.all(['matcher.js', 'settings.js', 'content.js'].map(file => readFile(path.join(EXTENSION, file), 'utf8')));
      for (const mode of ['delay', 'reject', 'throw']) {
        const controlled = await context.newPage();
        await controlled.route('https://example.test/chat', route => route.fulfill({contentType: 'text/html', body: fixture}));
        await controlled.addInitScript({content: `
          globalThis.chrome = {storage: {
            onChanged: {addListener() {}},
            local: {get() {
              ${mode === 'throw' ? 'throw new Error("test failure");' : mode === 'reject' ? 'return Promise.reject(new Error("test failure"));' : 'return new Promise(resolve => {globalThis.resolveStorage = resolve;});'}
            }}
          }};
          ${scripts.join('\n')}
        `});
        await controlled.goto('https://example.test/chat');
        await edit(controlled, 'rower');
        await blocked(controlled, true);
        await controlled.locator(INPUT).press('Enter');
        assert.equal(await controlled.evaluate(() => sent.length), 0);
        if (mode === 'delay') {
          await controlled.evaluate(() => resolveStorage({twitchGuardConfig: {version: 1, terms: ['mak']}}));
          await blocked(controlled, false);
        } else assert.match(await controlled.locator('.twitch-guard-warning').innerText(), /nie można odczytać/);
        await controlled.close();
      }
    });

    await t.test('popup storage failures show a useful error and keep the draft', async () => {
      const controlled = await context.newPage();
      const html = await readFile(path.join(EXTENSION, 'popup.html'), 'utf8');
      await controlled.route('https://example.test/**', async route => {
        const name = new URL(route.request().url()).pathname.slice(1) || 'popup.html';
        const body = name === 'popup.html' ? html : await readFile(path.join(EXTENSION, name), 'utf8');
        await route.fulfill({contentType: name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html', body});
      });
      await controlled.addInitScript(() => {
        globalThis.chrome = {storage: {onChanged: {addListener() {}}, local: {
          get: () => Promise.reject(new Error('controlled read failure')),
          set: () => Promise.reject(new Error('controlled write failure'))
        }}};
      });
      await controlled.goto('https://example.test/popup.html');
      await eventually(async () => (await controlled.locator('#status').innerText()).includes('Błąd odczytu'));
      await controlled.locator('#terms').fill('mak');
      await controlled.locator('#save').click();
      await eventually(async () => (await controlled.locator('#status').innerText()).includes('Nie udało się zapisać'));
      assert.equal(await controlled.locator('#terms').inputValue(), 'mak');
      assert.equal(await controlled.locator('#save').isEnabled(), true);
      await controlled.close();
    });

    assert.deepEqual(errors, []);
    await setTerms(['mak']);
    await edit(page, 'ma.k');
    await blocked(page, true);
    await mkdir(path.resolve(__dirname, '../test-results'), {recursive: true});
    await page.screenshot({path: path.resolve(__dirname, '../test-results/chat-blocked.png')});
    await popup.locator('body').screenshot({path: path.resolve(__dirname, '../test-results/settings.png')});
  } finally {
    if (context) await context.close();
    await rm(profile, {recursive: true, force: true});
  }
});
