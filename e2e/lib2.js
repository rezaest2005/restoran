const L = require('./lib');
const { shot } = L;

async function api(page, method, path, body) {
  return page.evaluate(async ([method, path, body]) => {
    const h = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + sessionStorage.getItem('access_token'),
      'X-Tenant-Slug': localStorage.getItem('tenant_slug') || '',
    };
    const r = await fetch(path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    let j = null;
    try { j = await r.json(); } catch (e) { /* not json */ }
    return { status: r.status, json: j };
  }, [method, path, body]);
}

function runner(tag) {
  const results = [];
  return {
    results,
    async step(name, fn) {
      try {
        const note = await fn();
        results.push({ name, ok: true, note: note || '' });
        console.log(`PASS ${tag} ${name} ${note || ''}`);
      } catch (e) {
        const msg = String(e.message || e).split('\n')[0];
        results.push({ name, ok: false, note: msg });
        console.log(`FAIL ${tag} ${name} :: ${msg}`);
      }
    },
  };
}

function must(r, codes = [200, 201]) {
  if (!codes.includes(r.status)) throw new Error(`HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
  return r.json && r.json.data !== undefined ? r.json.data : r.json;
}

function list(x) {
  if (Array.isArray(x)) return x;
  if (x && Array.isArray(x.results)) return x.results;
  if (x && Array.isArray(x.rows)) return x.rows;
  if (x && Array.isArray(x.items)) return x.items;
  if (x && Array.isArray(x.warehouses)) return x.warehouses;
  return [];
}

async function tabsShot(page, prefix, scope) {
  const root = typeof scope === 'number' ? page.getByRole('tablist').nth(scope) : (scope ? page.locator(scope) : page);
  const tabs = root.getByRole('tab');
  const n = await tabs.count();
  const names = [];
  for (let i = 0; i < n; i++) {
    const t = tabs.nth(i);
    if (!(await t.isVisible())) continue;
    const label = (await t.innerText()).trim().replace(/\s+/g, ' ');
    await t.click();
    await page.waitForTimeout(1500);
    await shot(page, `${prefix}-${String(i).padStart(2, '0')}`);
    names.push(label);
  }
  return names;
}

module.exports = { ...L, api, runner, must, list, tabsShot };
