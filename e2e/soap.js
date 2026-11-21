// Scenario 2: a liquid detergent factory that bought production + inventory + accounting.
// It defines a two-level production line (base concentrate -> bottled 1 L hand wash) and asks "how many can I make?".
const L = require('./lib2');
const B = L.BASE + '/soap-e2e/bizsuite_dashboard/app';

(async () => {
  const { browser, page, issues } = await L.start();
  const R = L.runner('soap');

  await R.step('login', async () => { await L.login(page, 'soap-e2e', 'soap_owner', 'E2ePass123!'); });

  await R.step('setup wizard: manufacturing', async () => {
    const dlg = page.getByRole('dialog');
    await dlg.getByText('تولیدی (شوینده').click();
    await dlg.getByRole('button', { name: 'بعدی' }).click();
    await page.waitForTimeout(800);
    await L.shot(page, 'S02-wizard-step2');
    await dlg.getByRole('button', { name: 'بعدی' }).click();
    await page.waitForTimeout(800);
    const btns = dlg.getByRole('button');
    await btns.nth((await btns.count()) - 1).click();
    await page.waitForTimeout(2500);
    if (await page.getByRole('dialog').count()) throw new Error('wizard still open');
    await L.shot(page, 'S03-home-after-wizard');
    const t = await L.text(page, 4000);
    const leaks = ['میز', 'آشپزخانه', 'باشگاه', 'پیک'].filter((w) => t.includes(w));
    return 'restaurant/club/courier words on home: ' + (leaks.join(',') || 'none');
  });

  const it = {};
  await R.step('items: raw, packaging, semi-finished, finished', async () => {
    const defs = [
      ['water', 'آب تصفیه‌شده', 'raw', 'l', 2000],
      ['sles', 'SLES ۷۰٪', 'raw', 'kg', 180000],
      ['capb', 'کوکامیدوپروپیل بتائین', 'raw', 'kg', 210000],
      ['salt', 'نمک صنعتی', 'raw', 'kg', 15000],
      ['scent', 'اسانس لیمو', 'raw', 'kg', 950000],
      ['color', 'رنگ خوراکی سبز', 'raw', 'g', 400],
      ['bottle', 'بطری پمپی ۱ لیتری', 'packaging', 'unit', 18000],
      ['label', 'برچسب', 'packaging', 'unit', 1500],
      ['base', 'پایه‌ی مایع دستشویی (کنسانتره)', 'semi_finished', 'kg', 0],
      ['hw', 'مایع دستشویی لیمویی ۱ لیتری', 'finished', 'unit', 0],
    ];
    for (const [k, name, material_type, unit, price] of defs) {
      it[k] = L.must(await L.api(page, 'POST', '/api/catalog/items/', { name, material_type, unit, price }));
    }
    return Object.keys(it).length + ' items';
  });

  await R.step('receive raw stock into the warehouse', async () => {
    const whs = L.list(L.must(await L.api(page, 'GET', '/api/inventory/warehouses/')));
    if (!whs.length) throw new Error('no warehouse');
    const wid = whs[0].id;
    const stock = { water: 800, sles: 40, capb: 15, salt: 10, scent: 2, color: 500, bottle: 300, label: 300 };
    for (const [k, q] of Object.entries(stock)) {
      L.must(await L.api(page, 'POST', '/api/inventory/receive/', { warehouse_id: wid, raw_material_id: it[k].id, quantity: q, unit_price: it[k].price || 1000 }));
    }
    return 'warehouse ' + whs[0].name;
  });

  await R.step('formula editor: detergent template + describe-your-process (screens only)', async () => {
    await page.goto(B + '/dictionary');
    await page.waitForTimeout(2500);
    await L.shot(page, 'S10-dict');
    await page.getByRole('tab', { name: 'فرمول‌ها' }).first().click().catch(async () => {
      await page.getByText('فرمول‌ها').first().click();
    });
    await page.waitForTimeout(1500);
    await L.shot(page, 'S11-formulas');
    const add = page.getByRole('button', { name: /فرمول|جدید|\+/ }).first();
    await add.click();
    await page.waitForTimeout(1500);
    await L.shot(page, 'S12-formula-dialog');
    await page.getByRole('button', { name: 'شروع از یک الگو' }).first().click().catch(() => {});
    await page.waitForTimeout(800);
    const tpl = page.getByText('شوینده / مایع دستشویی');
    if (await tpl.count()) { await tpl.first().click(); await page.waitForTimeout(1200); }
    await L.shot(page, 'S13-after-template');
    const notes = [];
    for (let i = 0; i < 3; i++) {
      const nx = page.getByRole('dialog').getByRole('button', { name: 'بعدی' });
      if (!(await nx.count()) || !(await nx.first().isEnabled())) { notes.push('next disabled at step ' + i); break; }
      await nx.first().click();
      await page.waitForTimeout(1000);
      await L.shot(page, 'S14-step' + (i + 1));
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    return notes.join('; ');
  });

  await R.step('describe-your-process parser (Persian)', async () => {
    const text = '۵۰۰ لیتر آب و ۱۰۰ کیلو SLES را ۲۰ دقیقه در میکسر مخلوط کن\n۵ کیلو نمک اضافه کن و ۱۰ دقیقه هم بزن\nتا ۴۰ درجه گرم کن ۳۰ دقیقه\nپر کردن در بطری ۶۰ دقیقه';
    const d = L.must(await L.api(page, 'POST', '/api/formulas/parse-process/', { text }));
    const stages = d.stages || [];
    const comps = stages.flatMap((s) => s.components || []);
    if (stages.length < 3) throw new Error('only ' + stages.length + ' stages: ' + JSON.stringify(d).slice(0, 300));
    return `${stages.length} stages [${stages.map((s) => s.name + ' ' + (s.run_minutes || '')).join(' / ')}], components matched: ${comps.filter((c) => c.material_id).length}/${comps.length}`;
  });

  let fBase, fHw;
  await R.step('two-level formula with production line', async () => {
    fBase = L.must(await L.api(page, 'POST', '/api/formulas/', {
      name: 'پایه‌ی مایع دستشویی', output_material_id: it.base.id, output_quantity: 100, industry: 'detergent', overhead_percent: 8,
      stages: [
        { name: 'توزین مواد', workstation: 'باسکول', setup_minutes: 10, run_minutes: 15, labour_rate: 600000 },
        { name: 'اختلاط', workstation: 'میکسر ۵۰۰ لیتری', run_minutes: 40, labour_rate: 600000, overhead_rate: 300000, quality_check: 'یکنواختی و نبود کف زیاد' },
        { name: 'تنظیم غلظت با نمک', workstation: 'میکسر ۵۰۰ لیتری', run_minutes: 15, quality_check: 'ویسکوزیته و pH بین ۶ تا ۷' },
      ],
      lines: [
        { material_id: it.water.id, quantity: 70, stage_index: 1 },
        { material_id: it.sles.id, quantity: 15, stage_index: 1, waste_percent: 2 },
        { material_id: it.capb.id, quantity: 5, stage_index: 1 },
        { material_id: it.salt.id, quantity: 2, stage_index: 2 },
        { material_id: it.scent.id, quantity: 500, unit: 'g', stage_index: 1 },
        { material_id: it.color.id, quantity: 20, stage_index: 1 },
      ],
    }));
    fHw = L.must(await L.api(page, 'POST', '/api/formulas/', {
      name: 'مایع دستشویی لیمویی ۱ لیتری', output_material_id: it.hw.id, output_quantity: 1, industry: 'detergent',
      stages: [
        { name: 'پرکردن', workstation: 'دستگاه پرکن', setup_minutes: 15, run_minutes: 0.5, labour_rate: 500000 },
        { name: 'درب‌بندی و برچسب', workstation: 'خط بسته‌بندی', run_minutes: 0.3, labour_rate: 500000 },
      ],
      lines: [
        { material_id: it.base.id, quantity: 1.05, stage_index: 0 },
        { material_id: it.bottle.id, quantity: 1, stage_index: 0 },
        { material_id: it.label.id, quantity: 1, stage_index: 1 },
      ],
    }));
    return `base #${fBase.id} (${(fBase.stages || []).length} stages), bottle #${fHw.id}`;
  });

  await R.step('cycle protection', async () => {
    const r = await L.api(page, 'PUT', `/api/formulas/${fBase.id}/`, { lines: [{ material_id: it.hw.id, quantity: 1 }] });
    if (r.status !== 400) throw new Error('cycle was accepted, HTTP ' + r.status);
    return 'refused: ' + JSON.stringify(r.json).slice(0, 120);
  });

  let plan;
  await R.step('"how many do I want?" planner for 500 bottles', async () => {
    plan = L.must(await L.api(page, 'POST', '/api/production/plan/', { items: [{ formula_id: fHw.id, quantity: 500 }] }));
    const short = plan.shortages || plan.purchase_list || plan.purchases || [];
    return `keys=${Object.keys(plan).join(',')} | shortages=${short.length} ${short.map((s) => (s.name || s.material) + ':' + (s.shortage || s.quantity)).join(', ')}`;
  });

  await R.step('planner for 200 bottles creates orders', async () => {
    const p = L.must(await L.api(page, 'POST', '/api/production/plan/', { items: [{ formula_id: fHw.id, quantity: 200 }], create_orders: true }));
    const made = p.orders || p.created_orders || [];
    return `can_produce=${p.can_produce}, orders created=${made.length}`;
  });

  await R.step('run production orders stage by stage, then complete', async () => {
    const orders = L.list(L.must(await L.api(page, 'GET', '/api/production/orders/')));
    if (!orders.length) throw new Error('no orders');
    const sorted = orders.slice().sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0)); // semi-finished first
    const out = [];
    for (const o0 of sorted) {
      const o = L.must(await L.api(page, 'GET', `/api/production/orders/${o0.id}/`));
      for (const s of o.steps || []) {
        L.must(await L.api(page, 'POST', `/api/production/orders/${o.id}/steps/${s.id}/start/`));
        L.must(await L.api(page, 'POST', `/api/production/orders/${o.id}/steps/${s.id}/complete/`, { good_quantity: o.planned_quantity, scrap_quantity: 0, actual_minutes: s.planned_minutes || 10, quality_ok: true }));
      }
      const done = L.must(await L.api(page, 'POST', `/api/production/orders/${o.id}/complete/`, { produced_quantity: o.planned_quantity, scrap_quantity: 0 }));
      out.push(`${o.formula_name || o.formula || o.id}: ${done.status} cost=${done.total_cost}`);
    }
    return out.join(' | ');
  });

  await R.step('stock after production', async () => {
    const st = L.list(L.must(await L.api(page, 'GET', '/api/inventory/stock/')));
    const find = (name) => st.filter((s) => JSON.stringify(s).includes(name)).map((s) => s.quantity).join('+');
    return `finished bottles=${find('لیمویی ۱ لیتری')}, base=${find('کنسانتره')}, SLES=${find('SLES')}, bottles empty=${find('بطری پمپی')}`;
  });

  await R.step('formula analysis', async () => {
    const a = L.must(await L.api(page, 'GET', `/api/formulas/${fHw.id}/analysis/`));
    return JSON.stringify(a).slice(0, 400);
  });

  await R.step('production screens', async () => {
    await page.goto(B + '/production');
    await page.waitForTimeout(3000);
    const names = await L.tabsShot(page, 'S20-prod');
    const planner = page.getByRole('tab', { name: 'چند تا می‌خواهم؟' });
    if (await planner.count()) {
      await planner.click();
      await page.waitForTimeout(1500);
      await L.shot(page, 'S25-planner');
    }
    return names.join(' | ');
  });

  await R.step('accounting screens (standalone with production)', async () => {
    await page.goto(B + '/dashboard?tab=accounting');
    await page.waitForTimeout(3000);
    await L.shot(page, 'S30-acc');
    return (await L.tabsShot(page, 'S31-acc', 1)).join(' | ');
  });

  await R.step('home with data', async () => {
    await page.goto(B + '/dashboard');
    await page.waitForTimeout(3500);
    await L.shot(page, 'S05-home-with-data');
  });

  await R.step('phone width 390px', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const out = [];
    for (const [n, u] of [['home', '/dashboard'], ['prod', '/production'], ['inv', '/inventory'], ['dict', '/dictionary'], ['acc', '/dashboard?tab=accounting']]) {
      await page.goto(B + u);
      await page.waitForTimeout(2500);
      await L.shot(page, 'S90-m-' + n);
      out.push(n + ':' + (await L.overflow(page)));
    }
    if (out.some((x) => +x.split(':')[1] > 2)) throw new Error('page wider than screen: ' + out.join(' '));
    return out.join(' ');
  });

  console.log('ISSUES', JSON.stringify([...new Set(issues)], null, 1));
  console.log('SUMMARY', R.results.filter((r) => r.ok).length + '/' + R.results.length);
  await browser.close();
})();
