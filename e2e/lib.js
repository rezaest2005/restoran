const { chromium } = require('playwright-core');
const BASE = 'http://localhost:5173';
const SHOTS = process.env.SHOTS;
async function start(width = 1280, height = 860) {
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'fa-IR' });
  const page = await ctx.newPage();
  const issues = [];
  page.on('console', m => { if (m.type() === 'error') issues.push('console: ' + m.text().slice(0, 200)); });
  page.on('pageerror', e => issues.push('pageerror: ' + String(e).slice(0, 300)));
  page.on('response', r => { const u = r.url(); if (u.includes('/api/') && r.status() >= 400) issues.push(`api ${r.status()} ${r.request().method()} ${u.replace(BASE, '')}`); });
  return { browser, ctx, page, issues };
}
async function login(page, slug, user, pass) {
  await page.goto(`${BASE}/${slug}/bizsuite_dashboard/login`);
  await page.locator('input[autocomplete="username"]').fill(user);
  await page.locator('input[type="password"]').fill(pass);
  await page.keyboard.press('Enter');
  await page.waitForURL(u => String(u).includes('bizsuite_dashboard/app'), { timeout: 20000 });
  await page.waitForTimeout(2500);
}
async function shot(page, name) { await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); }
async function overflow(page) { return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); }
async function text(page, n = 900) { return (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, n); }
module.exports = { start, login, shot, overflow, text, BASE };
