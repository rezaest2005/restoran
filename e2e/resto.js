// Scenario 1: a restaurant/cafe that bought accounting + delivery + customer club.
const L = require('./lib2');
const B = L.BASE + '/resto-e2e/bizsuite_dashboard/app';

(async () => {
  const { browser, page, issues } = await L.start();
  const R = L.runner('resto');

  await R.step('login', async () => { await L.login(page, 'resto-e2e', 'resto_owner', 'E2ePass123!'); });

  await R.step('setup wizard', async () => {
    const dlg = page.getByRole('dialog');
    await dlg.getByText('رستوران و کافه').click();
    await dlg.getByRole('button', { name: 'بعدی' }).click();
    await page.waitForTimeout(800);
    await L.shot(page, 'R02-wizard-step2');
    await dlg.getByRole('button', { name: 'بعدی' }).click();
    await page.waitForTimeout(800);
    await L.shot(page, 'R03-wizard-step3');
    const btns = dlg.getByRole('button');
    const last = btns.nth((await btns.count()) - 1);
    const label = (await last.innerText()).trim();
    await last.click();
    await page.waitForTimeout(2500);
    if (await page.getByRole('dialog').count()) throw new Error('wizard still open after clicking ' + label);
    await L.shot(page, 'R04-home-after-wizard');
    return 'finished with "' + label + '"';
  });

  const acc = {};
  let bank, cust;
  await R.step('accounting: chart template + fiscal year', async () => {
    L.must(await L.api(page, 'POST', '/api/accounting/chart-templates/', { key: 'restaurant' }));
    for (const a of L.list(L.must(await L.api(page, 'GET', '/api/accounting/accounts/')))) acc[a.code] = a;
    L.must(await L.api(page, 'POST', '/api/accounting/fiscal-years/', { name: '1405', start_date: '2026-03-21', end_date: '2027-03-20' }));
    return Object.keys(acc).length + ' accounts';
  });

  await R.step('accounting: bank, cash box, customer detail', async () => {
    bank = L.must(await L.api(page, 'POST', '/api/accounting/money-accounts/', { kind: 'bank', name: 'بانک ملت', opening_balance: '50000000', opening_date: '2026-11-01' }));
    L.must(await L.api(page, 'POST', '/api/accounting/money-accounts/', { kind: 'cash', name: 'صندوق سالن', opening_balance: '3000000', opening_date: '2026-11-01' }));
    cust = L.must(await L.api(page, 'POST', '/api/accounting/details/', { name: 'شرکت آلفا (پذیرایی همایش)', kind: 'customer' }));
  });

  await R.step('accounting: VAT sale, posted voucher, cheque deposited', async () => {
    L.must(await L.api(page, 'POST', '/api/accounting/vat-documents/', { kind: 'sale', net: '12000000', vat_rate: '10', method: 'bank', money_account_id: bank.id, date: '2026-11-15' }));
    const posting = Object.values(acc).filter((a) => a.level !== 'group' && a.is_postable !== false);
    const exp = posting.find((a) => a.code.startsWith('6')) || posting.find((a) => /هزینه/.test(a.name));
    const cashAcc = acc['1110'] || posting.find((a) => a.role === 'cash');
    const v = L.must(await L.api(page, 'POST', '/api/accounting/journal/', {
      date: '2026-11-16', status: 'draft', description: 'پرداخت قبض گاز و برق',
      lines: [{ account_id: exp.id, debit: 1800000 }, { account_id: cashAcc.id, credit: 1800000 }],
    }));
    L.must(await L.api(page, 'POST', `/api/accounting/journal/${v.id}/post/`));
    const ch = L.must(await L.api(page, 'POST', '/api/accounting/cheques/', { direction: 'received', party_id: cust.id, number: '445566', amount: '8500000', issue_date: '2026-11-10', due_date: '2026-11-25' }));
    L.must(await L.api(page, 'POST', `/api/accounting/cheques/${ch.id}/status/`, { to_status: 'deposited', date: '2026-11-19', money_account_id: bank.id }));
    return `expense ${exp.code} ${exp.name}, cash ${cashAcc.code}`;
  });

  await R.step('accounting: all reports answer', async () => {
    const bad = [];
    for (const n of ['journal-book', 'trial-balance-ext', 'cash-flow', 'aging', 'party-balances', 'vat']) {
      const r = await L.api(page, 'GET', `/api/accounting/reports/${n}/?from=2026-03-21&to=2027-03-20`);
      if (r.status !== 200) bad.push(n + ':' + r.status);
    }
    if (bad.length) throw new Error(bad.join(', '));
  });

  await R.step('accounting screens', async () => {
    await page.goto(B + '/dashboard?tab=accounting');
    await page.waitForTimeout(3000);
    return (await L.tabsShot(page, 'R10-acc', 1)).join(' | ');
  });

  await R.step('club: tier, coupon, 3 purchases without POS', async () => {
    L.must(await L.api(page, 'POST', '/api/club/tiers/', { name: 'طلایی', min_value: 100, multiplier: '2' }));
    L.must(await L.api(page, 'POST', '/api/club/coupons/', { code: 'YALDA20', kind: 'percent', value: 20 }));
    const pts = [];
    for (const [phone, name, amount] of [['09121110001', 'مینا', 850000], ['09121110002', 'آرش', 1250000], ['09121110001', 'مینا', 400000]]) {
      pts.push(L.must(await L.api(page, 'POST', '/api/club/purchases/', { phone, name, amount })).points_earned);
    }
    return 'points earned ' + pts.join(', ');
  });

  await R.step('club screens', async () => {
    await page.goto(B + '/dashboard?tab=club');
    await page.waitForTimeout(3000);
    return (await L.tabsShot(page, 'R20-club', 1)).join(' | ');
  });

  await R.step('delivery: courier from Users & access, zone, trip with 3 stops', async () => {
    const tp = L.must(await L.api(page, 'POST', '/api/users/transport/', {
      username: 'courier1', password: 'secret99', first_name: 'علی', last_name: 'پیک', phone_number: '09120000002',
      service: 'orders', new_vehicle: { kind: 'motorbike', plate: '123ب45' },
    }));
    L.must(await L.api(page, 'POST', '/api/delivery/zones/', { name: 'مرکز شهر', fee: 50000, free_over: 1000000, polygon: [[35.6, 51.3], [35.6, 51.5], [35.8, 51.5], [35.8, 51.3]], eta_minutes: 40 }));
    const drivers = L.list(L.must(await L.api(page, 'GET', '/api/delivery/drivers/')));
    const d = drivers.find((x) => JSON.stringify(x).includes('علی')) || drivers[0];
    const trip = L.must(await L.api(page, 'POST', '/api/delivery/trips/', {
      driver_id: d && d.id,
      stops: [
        { address: 'خیابان ولیعصر، پلاک ۱۰', lat: 35.72, lng: 51.41, recipient_name: 'مینا', recipient_phone: '09121110001', cod_amount: 850000, packages: 1 },
        { address: 'میدان ونک', lat: 35.757, lng: 51.41, recipient_name: 'آرش', recipient_phone: '09121110002', packages: 2, priority: 2 },
        { address: 'خیابان انقلاب', lat: 35.70, lng: 51.39, recipient_name: 'سارا', recipient_phone: '09121110003', cod_amount: 420000, packages: 1 },
      ],
    }));
    const stops = trip.stops || [];
    return `drivers=${drivers.length}, trip ${trip.id}, stops=${stops.length}, zone fee on stop1=${stops[0] && stops[0].fee}, transport user ${tp.user_id || ''}`;
  });

  await R.step('delivery screens', async () => {
    await page.goto(B + '/delivery');
    await page.waitForTimeout(3000);
    return (await L.tabsShot(page, 'R30-dlv')).join(' | ');
  });

  await R.step('definitions + users & access', async () => {
    await page.goto(B + '/dictionary');
    await page.waitForTimeout(3000);
    await L.shot(page, 'R40-dict');
    await page.goto(B + '/dictionary?tab=users');
    await page.waitForTimeout(3000);
    await L.shot(page, 'R41-users');
    const txt = await L.text(page, 5000);
    if (!txt.includes('علی')) throw new Error('courier not visible in Users & access');
    return 'courier listed in Users & access';
  });

  await R.step('home with data', async () => {
    await page.goto(B + '/dashboard');
    await page.waitForTimeout(3500);
    await L.shot(page, 'R05-home-with-data');
    const t = await L.text(page, 4000);
    const leaks = ['انبار', 'تولید', 'صندوق فروش'].filter((w) => t.includes(w));
    return 'words from modules not bought on home: ' + (leaks.join(',') || 'none');
  });

  await R.step('phone width 390px', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const out = [];
    for (const [n, u] of [['home', '/dashboard'], ['acc', '/dashboard?tab=accounting'], ['club', '/dashboard?tab=club'], ['dlv', '/delivery'], ['dict', '/dictionary'], ['users', '/dictionary?tab=users']]) {
      await page.goto(B + u);
      await page.waitForTimeout(2500);
      await L.shot(page, 'R90-m-' + n);
      out.push(n + ':' + (await L.overflow(page)));
    }
    if (out.some((x) => +x.split(':')[1] > 2)) throw new Error('page wider than screen: ' + out.join(' '));
    return out.join(' ');
  });

  console.log('ISSUES', JSON.stringify([...new Set(issues)], null, 1));
  console.log('SUMMARY', R.results.filter((r) => r.ok).length + '/' + R.results.length);
  await browser.close();
})();
