import { COMPANIES, SCENARIOS, analyzeCompany, linkedStatements, waccBuild, forecastCsv, valuationMemo } from './engine.js';
import { rangeChart, waterfallChart, barChart, mount } from './charts.js';
import { $, $$, esc, download, router } from './dom.js';

const PCT_KEYS = ['growth1', 'growth5', 'margin1', 'margin5', 'taxRate', 'daPct', 'capexPct', 'nwcPct', 'wacc', 'terminalGrowth'];
const NUM_KEYS = ['revenue', 'debt', 'cash', 'shares'];
const CAPM_PCT = ['rf', 'erp', 'kd', 'dv'];
const clone = (c) => ({ ...c, capm: { ...c.capm } });
const state = { idx: 0, edits: COMPANIES.map(clone), scenario: 'base', midYear: false, a: null };

/* Banking number style: thousands separators, negatives in brackets. */
const cr = (v, d = 1) => {
  if (!Number.isFinite(v)) return '—';
  const s = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  return v < -1e-9 ? `(${s})` : s;
};
const cell = (v, d = 1) => `<td${v < -1e-9 ? ' class="neg"' : ''}>${cr(v, d)}</td>`;
const price = (v) => (Number.isFinite(v) ? `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');
const pct = (v, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—');
const mult = (v) => `${v.toFixed(1)}×`;

/* ---------- Company switcher and inputs ---------- */
function buildCompanies() {
  $('#companies').innerHTML = COMPANIES.map((c, i) => `<button type="button" data-i="${i}" aria-pressed="${i === state.idx}"><b>${esc(c.name)}</b><small>${esc(c.id)}, ${esc(c.sector)}</small></button>`).join('');
  $$('#companies button').forEach((b) => b.addEventListener('click', () => {
    state.idx = Number(b.dataset.i);
    $$('#companies button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    fillInputs(); recalc();
  }));
}

function fillInputs() {
  const c = state.edits[state.idx];
  for (const k of NUM_KEYS) $(`#${k}`).value = c[k];
  for (const k of PCT_KEYS) $(`#${k}`).value = +(c[k] * 100).toFixed(3);
  for (const k of CAPM_PCT) $(`#${k}`).value = +(c.capm[k] * 100).toFixed(3);
  $('#beta').value = c.capm.beta;
}

function readInputs() {
  const c = state.edits[state.idx];
  const val = (id) => {
    const el = $(`#${id}`), v = Number(el.value);
    if (el.value === '' || !Number.isFinite(v)) throw Error(`${el.parentElement.firstChild.textContent.trim()} needs a number.`);
    return v;
  };
  for (const k of NUM_KEYS) c[k] = val(k);
  for (const k of PCT_KEYS) c[k] = val(k) / 100;
  for (const k of CAPM_PCT) c.capm[k] = val(k) / 100;
  c.capm.beta = val('beta');
}

function recalc() {
  try {
    readInputs();
    state.a = analyzeCompany(state.edits[state.idx], { scenario: state.scenario, midYear: state.midYear });
    $('#err').hidden = true;
    render();
  } catch (e) {
    $('#err').hidden = false;
    $('#err').textContent = `${e.message} The last valid result is still shown.`;
  }
}

/* ---------- Summary ---------- */
function renderSummary(a) {
  const c = a.company, d = a.dcf;
  $('#coName').textContent = c.name;
  $('#coSub').textContent = `${c.sector}. ${SCENARIOS[a.scenario].name} case, ${state.midYear ? 'mid-year' : 'year-end'} discounting, ₹ crore unless stated.`;
  $('#kpis').innerHTML = [
    ['DCF value per share', price(d.pricePerShare), 'lead'],
    ['Enterprise value', `₹${cr(d.enterpriseValue, 0)} cr`],
    ['Equity value', `₹${cr(d.equityValue, 0)} cr`],
    ['Terminal value share', pct(d.terminalShare)],
    ['Implied exit multiple', mult(d.impliedExitMultiple)],
  ].map(([k, v, cls]) => `<div class="${cls || ''}"><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  mount($('#football'), (width) => rangeChart({
    width, rowHeight: width < 600 ? 54 : 50, format: (v) => `₹${Math.round(v)}`, label: 'Football field of value per share by method',
    rows: a.football.map((r) => ({ ...r, cls: r.key })),
    markers: [{ value: d.pricePerShare, label: `Base DCF ${price(d.pricePerShare)}` }],
  }));
  mount($('#bridge'), (width) => waterfallChart({
    width, height: 270, format: (v) => cr(v, 0), label: 'Bridge from enterprise value to equity value',
    items: [
      { label: 'PV of FCF', value: d.pvFcf }, { label: 'PV of TV', value: d.pvTerminal },
      { label: 'EV', value: d.enterpriseValue, total: true },
      { label: 'Debt', value: -c.debt }, { label: 'Cash', value: c.cash },
      { label: 'Equity', value: d.equityValue, total: true },
    ],
  }));
  $('#flags').innerHTML = a.flags.map((f) => `<li>${esc(f)}</li>`).join('');
}

/* ---------- Model ---------- */
function renderModel(a) {
  const f = a.dcf.forecast, c = a.company;
  const head = `<thead><tr><th>₹ crore</th><th>Base</th>${f.map((x) => `<th>FY${String(27 + x.year).padStart(2, '0')}E</th>`).join('')}</tr></thead>`;
  const row = (label, base, key, cls = '', d = 1) => `<tr class="${cls}"><td>${label}</td>${base === null ? '<td></td>' : cell(base, d)}${f.map((x) => cell(typeof key === 'function' ? key(x) : x[key], d)).join('')}</tr>`;
  const prow = (label, key) => `<tr class="pct"><td>${label}</td><td></td>${f.map((x) => `<td>${pct(typeof key === 'function' ? key(x) : x[key])}</td>`).join('')}</tr>`;
  $('#forecast').innerHTML = head + '<tbody>' + [
    row('Revenue', c.revenue, 'revenue'), prow('growth', 'growth'),
    row('EBITDA', null, 'ebitda'), prow('margin', (x) => x.ebitda / x.revenue),
    row('Depreciation and amortisation', null, (x) => -x.da),
    row('EBIT', null, 'ebit', 'sub'), prow('margin', 'margin'),
    row('Taxes on EBIT', null, (x) => -x.tax),
    row('NOPAT', null, 'nopat', 'sub'),
    row('Add back D&amp;A', null, 'da'), row('Capital expenditure', null, (x) => -x.capex), row('Increase in net working capital', null, (x) => -x.deltaNwc),
    row('Unlevered free cash flow', null, 'ufcf', 'sub'),
    row('Discount factor', null, 'discountFactor', 'pct', 3),
    row('Present value of UFCF', null, 'pv', 'total'),
  ].join('') + '</tbody>';
  const w = waccBuild({ ...c.capm, taxRate: c.taxRate });
  $('#waccOut').innerHTML = `<div><dt>Cost of equity</dt><dd>${pct(w.costOfEquity, 2)}</dd></div><div><dt>After-tax cost of debt</dt><dd>${pct(w.afterTaxDebt, 2)}</dd></div><div class="total"><dt>WACC</dt><dd>${pct(w.wacc, 2)}</dd></div>`;
  const y5 = f.at(-1);
  mount($('#fcfChart'), (width) => waterfallChart({
    width, height: 260, format: (v) => cr(v, 0), label: 'Final forecast year: EBITDA to unlevered free cash flow',
    items: [
      { label: 'EBITDA', value: y5.ebitda, total: true }, { label: 'Tax on EBIT', value: -y5.tax },
      { label: 'Capex', value: -y5.capex }, { label: 'More NWC', value: -y5.deltaNwc },
      { label: 'UFCF', value: y5.ufcf, total: true },
    ],
  }));
  $('#conversion').textContent = `${pct(y5.ufcf / y5.ebitda, 0)} of FY${27 + y5.year}E EBITDA converts to free cash flow; this is the cash flow the terminal value capitalises.`;
}

/* ---------- Sensitivity ---------- */
function heat(grid, colLabels, base) {
  const shade = (v) => {
    if (v === null) return 'background:#f1f3f6;color:#98a3b4';
    const diff = (v - base) / Math.max(1, Math.abs(base)), alpha = Math.min(0.42, Math.abs(diff) * 0.9) + 0.04;
    return `background:rgba(${diff >= 0 ? '23,72,208' : '140,42,53'},${alpha.toFixed(3)})`;
  };
  return `<thead><tr><th>WACC</th>${colLabels.map((l) => `<th scope="col">${l}</th>`).join('')}</tr></thead><tbody>${grid.cells.map((r, i) => `<tr><th scope="row">${pct(grid.waccs[i])}</th>${r.map((v, j) => `<td class="${i === 2 && j === 2 ? 'base' : ''}" style="${shade(v)}">${v === null ? 'n/a' : Math.round(v)}</td>`).join('')}</tr>`).join('')}</tbody>`;
}
function renderSensitivity(a) {
  const base = a.dcf.pricePerShare;
  $('#heatG').innerHTML = `<caption>Columns: perpetual growth rate</caption>${heat(a.sensitivity, a.sensitivity.growths.map((g) => pct(g)), base)}`;
  $('#heatX').innerHTML = `<caption>Columns: exit EV / EBITDA</caption>${heat(a.exitSensitivity, a.exitSensitivity.multiples.map(mult), a.exitDcf.pricePerShare)}`;
  mount($('#tornado'), (width) => rangeChart({
    width, rowHeight: 40, format: (v) => `₹${Math.round(v)}`, label: 'Tornado chart of value drivers',
    rows: a.tornado.map((t) => ({ label: t.label, lo: t.low, hi: t.high, cls: 'up', note: `swing ₹${Math.round(t.swing)}` })),
    markers: [{ value: base, label: `Base ${price(base)}` }],
  }));
}

/* ---------- Comparables ---------- */
function renderComps(a) {
  const c = a.company, e = a.forwardEbitda;
  $('#fwdEbitda').textContent = `₹${cr(e)} crore`;
  $('#peerTable').innerHTML = `<thead><tr><th>Company</th><th>EV / forward EBITDA</th><th>Revenue growth</th><th>EBIT margin</th><th>Implied EV (₹ cr)</th><th>Implied value per share</th></tr></thead><tbody>${c.peers.map((p, i) => `<tr><td>${esc(p.name)}</td><td>${mult(p.multiple)}</td><td>${pct(p.growth, 0)}</td><td>${pct(p.margin, 0)}</td>${cell(a.trading.values[i].enterpriseValue, 0)}<td>${price(a.trading.values[i].pricePerShare)}</td></tr>`).join('')}<tr class="median"><td>Median</td><td>${mult(a.trading.medianMultiple)}</td><td></td><td></td><td>${cr(a.trading.medianMultiple * e, 0)}</td><td>${price(a.trading.medianPrice)}</td></tr></tbody>`;
  $('#dealTable').innerHTML = `<thead><tr><th>Target</th><th>Buyer</th><th>Year</th><th>EV / forward EBITDA</th><th>Implied value per share</th></tr></thead><tbody>${c.precedents.map((p, i) => `<tr><td>${esc(p.target)}</td><td>${esc(p.acquirer)}</td><td>${p.year}</td><td>${mult(p.multiple)}</td><td>${price(a.transactions.values[i].pricePerShare)}</td></tr>`).join('')}<tr class="median"><td>Median</td><td></td><td></td><td>${mult(a.transactions.medianMultiple)}</td><td>${price(a.transactions.medianPrice)}</td></tr></tbody>`;
  mount($('#compBars'), (width) => barChart({
    width, rowHeight: 28, format: price, label: 'Implied value per share by comparable',
    items: [
      ...c.peers.map((p, i) => ({ label: p.name, value: a.trading.values[i].pricePerShare, cls: 'pos' })),
      ...c.precedents.map((p, i) => ({ label: `${p.target} (deal)`, value: a.transactions.values[i].pricePerShare, cls: 'deal' })),
    ],
  }));
}

/* ---------- Statements ---------- */
function renderStatements(a) {
  let st;
  try {
    const n = (id) => { const v = Number($(`#${id}`).value); if (!Number.isFinite(v) || v < 0) throw Error('Statement inputs must be zero or positive numbers.'); return v; };
    st = linkedStatements(a.company, { interestRate: n('ir') / 100, repayment: n('repay'), payout: Math.min(1, n('payout') / 100) });
  } catch (e) { $('#err').hidden = false; $('#err').textContent = e.message; return; }
  const r = st.rows, o = st.opening;
  const yrs = r.map((x) => `<th>FY${27 + x.year}E</th>`).join('');
  const line = (label, fn, cls = '') => `<tr class="${cls}"><td>${label}</td>${r.map((x) => cell(fn(x))).join('')}</tr>`;
  $('#is').innerHTML = `<thead><tr><th>₹ crore</th>${yrs}</tr></thead><tbody>${[
    line('Revenue', (x) => x.revenue), line('EBITDA', (x) => x.ebitda), line('Depreciation and amortisation', (x) => -x.da),
    line('EBIT', (x) => x.ebit, 'sub'), line('Interest expense', (x) => -x.interest), line('Profit before tax', (x) => x.ebt, 'sub'),
    line('Tax', (x) => -x.tax), line('Net income', (x) => x.netIncome, 'total'),
  ].join('')}</tbody>`;
  $('#cf').innerHTML = `<thead><tr><th>₹ crore</th>${yrs}</tr></thead><tbody>${[
    line('Net income', (x) => x.netIncome), line('Add back D&amp;A', (x) => x.da), line('Increase in working capital', (x) => x.cfo - x.netIncome - x.da),
    line('Cash from operations', (x) => x.cfo, 'sub'), line('Capital expenditure', (x) => x.cfi), line('Cash from investing', (x) => x.cfi, 'sub'),
    line('Debt repaid', (x) => x.cff + x.dividends), line('Dividends', (x) => -x.dividends), line('Cash from financing', (x) => x.cff, 'sub'),
    line('Net change in cash', (x) => x.netChange, 'total'), line('Closing cash', (x) => x.cash),
  ].join('')}</tbody>`;
  const bl = (label, open, fn, cls = '') => `<tr class="${cls}"><td>${label}</td>${cell(open)}${r.map((x) => cell(fn(x))).join('')}</tr>`;
  const maxErr = Math.max(...r.map((x) => Math.abs(x.balanceCheck)));
  $('#bs').innerHTML = `<thead><tr><th>₹ crore</th><th>Opening</th>${yrs}</tr></thead><tbody>${[
    bl('Cash', o.cash, (x) => x.cash), bl('Net property, plant and equipment', o.ppe, (x) => x.ppe), bl('Net working capital', o.nwc, (x) => x.nwc),
    bl('Total assets', o.cash + o.ppe + o.nwc, (x) => x.totalAssets, 'sub'),
    bl('Debt', o.debt, (x) => x.debt), bl('Shareholders’ equity', o.equity, (x) => x.equity),
    bl('Total liabilities and equity', o.debt + o.equity, (x) => x.debt + x.equity, 'sub'),
    `<tr class="head"><td>Net debt / EBITDA</td><td></td>${r.map((x) => `<td>${x.debt > x.cash ? mult((x.debt - x.cash) / x.ebitda) : 'Net cash'}</td>`).join('')}</tr>`,
  ].join('')}</tbody>`;
  $('#bsCheck').textContent = maxErr < 1e-6 ? 'Assets equal liabilities plus equity in every year.' : `Out of balance by ${maxErr.toFixed(4)}.`;
}

function render() {
  const a = state.a;
  renderSummary(a); renderModel(a); renderSensitivity(a); renderComps(a); renderStatements(a);
  $('#memo').textContent = valuationMemo(a);
}

/* ---------- Wiring ---------- */
buildCompanies(); fillInputs();
let t; const soon = () => { clearTimeout(t); t = setTimeout(recalc, 120); };
$('#assumptions').addEventListener('input', soon);
$('#assumptions').addEventListener('submit', (e) => e.preventDefault());
$('#stInputs').addEventListener('input', () => state.a && renderStatements(state.a));
$$('input[name="scenario"]').forEach((r) => r.addEventListener('change', () => { state.scenario = r.value; recalc(); }));
$('#midYear').addEventListener('change', (e) => { state.midYear = e.target.checked; recalc(); });
$('#reset').addEventListener('click', () => { state.edits[state.idx] = clone(COMPANIES[state.idx]); fillInputs(); recalc(); });
$('#useWacc').addEventListener('click', () => {
  const c = state.edits[state.idx];
  $('#wacc').value = +(waccBuild({ ...c.capm, taxRate: c.taxRate }).wacc * 100).toFixed(2);
  recalc();
});
$('#csv').addEventListener('click', () => state.a && download(`meridian-${state.a.company.id}-${state.scenario}-forecast.csv`, forecastCsv(state.a), 'text/csv'));
$('#memoDl').addEventListener('click', () => state.a && download(`meridian-${state.a.company.id}-${state.scenario}-memo.txt`, valuationMemo(state.a)));
router($$('[data-view]'), (id) => {
  document.title = `Meridian — ${{ summary: 'valuation desk', model: 'operating model', sensitivity: 'sensitivity', comps: 'comparables', statements: 'three statements', memo: 'memo' }[id]}`;
  if (state.a) requestAnimationFrame(render);
});
recalc();
