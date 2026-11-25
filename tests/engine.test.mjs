import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPANIES, SCENARIOS, applyScenario, waccBuild, buildForecast, calculateDcf, multiplesValue, sensitivityGrid, exitGrid,
  tornado, linkedStatements, statementModel, analyzeCompany, forecastCsv, valuationMemo, median,
} from '../src/engine.js';

const approx = (a, b, eps = 1e-7) => assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

test('forecast follows top-line, UFCF and discounting maths', () => {
  const b = COMPANIES[0], f = buildForecast(b);
  assert.equal(f.length, 5);
  approx(f[0].revenue, b.revenue * (1 + b.growth1));
  approx(f[4].growth, b.growth5); approx(f[4].margin, b.margin5);
  const x = f[0];
  approx(x.ufcf, x.ebit * (1 - b.taxRate) + x.da - x.capex - x.deltaNwc);
  approx(x.pv, x.ufcf / (1 + b.wacc));
  approx(buildForecast(b, { midYear: true })[0].pv, x.ufcf / (1 + b.wacc) ** 0.5);
});

test('DCF reconciles terminal, enterprise, equity and per-share value', () => {
  const b = COMPANIES[0], x = calculateDcf(b);
  approx(x.enterpriseValue, x.pvFcf + x.pvTerminal);
  approx(x.equityValue, x.enterpriseValue - b.debt + b.cash);
  approx(x.pricePerShare, x.equityValue / b.shares);
  assert.ok(x.terminalShare > 0 && x.terminalShare < 1);
  // The implied perpetual growth of a Gordon terminal value is the input growth.
  approx(x.impliedPerpetualGrowth, b.terminalGrowth, 1e-9);
});

test('exit-multiple terminal value round-trips with the implied multiple', () => {
  const b = COMPANIES[1], g = calculateDcf(b);
  const e = calculateDcf(b, { terminalMethod: 'exit', exitMultiple: g.impliedExitMultiple });
  approx(e.pricePerShare, g.pricePerShare, 1e-6);
  assert.throws(() => calculateDcf(b, { terminalMethod: 'exit', exitMultiple: 0 }), /Exit multiple/);
});

test('WACC up lowers value; terminal growth up raises it; mid-year raises it', () => {
  const b = COMPANIES[0], base = calculateDcf(b).pricePerShare;
  assert.ok(calculateDcf(b, { wacc: b.wacc + 0.01 }).pricePerShare < base);
  assert.ok(calculateDcf(b, { terminalGrowth: b.terminalGrowth + 0.005 }).pricePerShare > base);
  assert.ok(calculateDcf(b, { midYear: true }).pricePerShare > base);
});

test('CAPM WACC build lands near each company\'s stated WACC', () => {
  for (const c of COMPANIES) {
    const w = waccBuild({ ...c.capm, taxRate: c.taxRate });
    approx(w.costOfEquity, c.capm.rf + c.capm.beta * c.capm.erp);
    assert.ok(Math.abs(w.wacc - c.wacc) < 0.003, `${c.id}: ${w.wacc} vs ${c.wacc}`);
  }
  assert.throws(() => waccBuild({ rf: 0.07, erp: 0.06, beta: 1, kd: 0.09, dv: 1, taxRate: 0.25 }));
});

test('scenarios order bear < base < bull', () => {
  for (const c of COMPANIES) {
    const [bear, base, bull] = ['bear', 'base', 'bull'].map((k) => calculateDcf(applyScenario(c, k)).pricePerShare);
    assert.ok(bear < base && base < bull, c.id);
  }
  assert.deepEqual(applyScenario(COMPANIES[0], 'base'), COMPANIES[0]);
  assert.throws(() => applyScenario(COMPANIES[0], 'moon'));
  assert.equal(Object.keys(SCENARIOS).length, 3);
});

test('sensitivity grids are centred on the base case; peer median is right', () => {
  const b = COMPANIES[1], s = sensitivityGrid(b);
  approx(s.cells[2][2], calculateDcf(b).pricePerShare);
  const e = exitGrid(b, 9.2);
  approx(e.cells[2][2], calculateDcf(b, { terminalMethod: 'exit', exitMultiple: 9.2 }).pricePerShare);
  const m = multiplesValue(b, [8, 12, 10, 14], 100);
  approx(m.medianMultiple, 11); approx(m.medianPrice, (1100 - b.debt + b.cash) / b.shares);
  assert.equal(median([3, 1, 2]), 2);
});

test('tornado: every bar straddles the base value and is sorted by swing', () => {
  const t = tornado(COMPANIES[2]);
  for (const r of t) assert.ok(r.low <= r.base + 1e-9 && r.high >= r.base - 1e-9, r.key);
  for (let i = 1; i < t.length; i++) assert.ok(t[i - 1].swing >= t[i].swing);
});

test('linked statements balance every year and cash reconciles to the cash flow', () => {
  for (const c of COMPANIES) {
    const { opening, rows } = linkedStatements(c);
    let cash = opening.cash;
    for (const y of rows) {
      approx(y.balanceCheck, 0, 1e-8);
      cash += y.netChange; approx(cash, y.cash, 1e-8);
    }
    approx(rows[0].revenue, buildForecast(c)[0].revenue);
  }
});

test('legacy statement model still balances and rejects an unbalanced opening', () => {
  const x = { revenue: 1250, growth: 0.08, margin: 0.17, daPct: 0.038, capexPct: 0.057, nwcPct: 0.11, tax: 0.25, interestRate: 0.09, debt: 260, repayment: 30, cash: 95, ppe: 450, nwc: 137.5, equity: 422.5 };
  for (const y of statementModel(x)) approx(y.balanceCheck, 0, 1e-8);
  assert.throws(() => statementModel({ ...x, equity: 0 }));
});

test('analysis: football field ranges contain their mid-points; memo and CSV export', () => {
  const a = analyzeCompany(COMPANIES[2], { scenario: 'bull' });
  assert.equal(a.football.length, 5);
  for (const r of a.football) assert.ok(r.lo <= r.mid + 1e-9 && r.mid <= r.hi + 1e-9, r.key);
  assert.match(valuationMemo(a), /SYNTHETIC COMPANY/);
  assert.equal(forecastCsv(a).split('\n').length, 6);
  assert.throws(() => calculateDcf({ ...COMPANIES[2], wacc: 0.06, terminalGrowth: 0.06 }), /below WACC/);
  assert.throws(() => calculateDcf({ ...COMPANIES[2], wacc: NaN }), /finite number/);
});

test('the exit multiple is the peer median rounded half-up, as Excel would round it', () => {
  const hps = COMPANIES.find((c) => c.id === 'HPS');
  assert.equal(median(hps.peerMultiples), 10.45);
  assert.equal(analyzeCompany(hps).exitMultiple, 10.5);
  assert.equal(analyzeCompany(COMPANIES.find((c) => c.id === 'NMC')).exitMultiple, 11.9);
});
