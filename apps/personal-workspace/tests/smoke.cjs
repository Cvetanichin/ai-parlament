// Smoke test. Requires Playwright to be resolvable (global or local). Run: node tests/smoke.cjs
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.route('https://api.anthropic.com/v1/messages', (route) => route.fulfill({
    json: { stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 20 }, content: [{ type: 'text', text: '## Summary\nPlan.\n\n```workspace-tasks\n[{"title":"Kick off","due":"2099-01-05","effort":2,"priority":3,"notes":"x"},{"title":"","due":"bad"}]\n```' }] },
  }));
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForSelector('text=Getting started');

  // tasks
  await page.fill('[aria-label="Quick add task"]', 'Write proposal');
  await page.fill('[aria-label="Due date"]', new Date(Date.now() - 864e5 * 2).toISOString().slice(0, 10));
  await page.click('button:has-text("Add")');
  await page.waitForSelector('.banner:has-text("overdue")');

  // sample data + nav
  await page.goto(page.url().split('#')[0] + '#/settings');
  await page.click('text=Load sample data');
  await page.goto(page.url().split('#')[0] + '#/projects');
  await page.waitForSelector('text=Sample: Donor report');

  // agent with mocked API
  await page.goto(page.url().split('#')[0] + '#/settings');
  await page.fill('input[type=password]', 'k');
  await page.goto(page.url().split('#')[0] + '#/agents/drafter');
  await page.fill('#f-idea', 'Launch a pilot');
  await page.click('button:has-text("Run agent")');
  await page.waitForSelector('button:has-text("Import 1 task(s)")');
  await page.click('button:has-text("Import 1 task(s)")');
  await page.goto(page.url().split('#')[0] + '#/tasks');
  await page.waitForSelector('text=Kick off');

  // prompt pack
  await page.goto(page.url().split('#')[0] + '#/agents/writer');
  await page.click('button:has-text("Prompt Pack")');
  await page.waitForSelector('dialog[open] >> text=Creative Writing Agent');
  await page.keyboard.press('Escape');

  // library versions + search
  await page.goto(page.url().split('#')[0] + '#/library');
  await page.click('text=New document');
  await page.fill('[aria-label="Content"]', 'line one\nline two');
  await page.click('button:has-text("Save version")');
  await page.fill('[aria-label="Content"]', 'line one\nline TWO');
  await page.click('button:has-text("Save version")');
  await page.click('button:has-text("History (3)")');
  await page.click('dialog[open] >> text=Compare >> nth=0');
  await page.waitForSelector('.diff .add');
  await page.keyboard.press('Escape');

  // persistence across reload
  await page.waitForTimeout(400);
  await page.reload();
  await page.goto(page.url().split('#')[0] + '#/tasks');
  await page.waitForSelector('text=Write proposal');

  // insights + deadline local triage render without error
  await page.goto(page.url().split('#')[0] + '#/insights');
  await page.waitForSelector('text=Agent effectiveness');
  assert.deepStrictEqual(errors, [], 'page errors: ' + errors.join('; '));
  await browser.close();
  console.log('smoke: OK');
})().catch((e) => { console.error(e); process.exit(1); });
