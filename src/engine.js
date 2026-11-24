/*
 * Meridian valuation engine — pure functions, no DOM.
 * Unlevered DCF (Gordon growth or exit multiple), trading and precedent multiples, scenarios,
 * sensitivity, tornado and a linked three-statement build.
 * Figures in INR crore unless stated. Companies, peers and deals are synthetic.
 */

export const COMPANIES = [
  {
    id: 'HPS', name: 'Helios Precision Systems', sector: 'Industrial components',
    revenue: 1250, growth1: 0.12, growth5: 0.06, margin1: 0.17, margin5: 0.205,
    taxRate: 0.25, daPct: 0.038, capexPct: 0.057, nwcPct: 0.11,
    wacc: 0.115, terminalGrowth: 0.035, debt: 260, cash: 95, shares: 16.5,
    capm: { rf: 0.07, erp: 0.06, beta: 0.85, kd: 0.09, dv: 0.12 },
    peers: [
      { name: 'Kestrel Motion Works', multiple: 8.7, growth: 0.07, margin: 0.15 },
      { name: 'Arcadia Bearings', multiple: 10.1, growth: 0.09, margin: 0.18 },
      { name: 'Trident Fluid Controls', multiple: 10.8, growth: 0.11, margin: 0.19 },
      { name: 'Veritas Drive Systems', multiple: 12.0, growth: 0.13, margin: 0.21 },
    ],
    precedents: [
      { target: 'Orion Castings', acquirer: 'Strategic buyer', year: 2023, multiple: 11.2 },
      { target: 'Lumen Gearworks', acquirer: 'Private equity', year: 2024, multiple: 12.6 },
      { target: 'Sable Hydraulics', acquirer: 'Strategic buyer', year: 2025, multiple: 13.4 },
    ],
  },
  {
    id: 'SFP', name: 'Saffron Food Packaging', sector: 'Consumer packaging',
    revenue: 680, growth1: 0.09, growth5: 0.045, margin1: 0.135, margin5: 0.155,
    taxRate: 0.255, daPct: 0.032, capexPct: 0.045, nwcPct: 0.09,
    wacc: 0.13, terminalGrowth: 0.03, debt: 125, cash: 43, shares: 10.4,
    capm: { rf: 0.07, erp: 0.06, beta: 1.1, kd: 0.1, dv: 0.1 },
    peers: [
      { name: 'Monsoon Flexibles', multiple: 7.6, growth: 0.05, margin: 0.12 },
      { name: 'Indus Cartons', multiple: 8.9, growth: 0.07, margin: 0.14 },
      { name: 'Coral Polymers', multiple: 9.5, growth: 0.08, margin: 0.15 },
      { name: 'Banyan Closures', multiple: 10.7, growth: 0.1, margin: 0.17 },
    ],
    precedents: [
      { target: 'Pristine Pack', acquirer: 'Strategic buyer', year: 2022, multiple: 9.6 },
      { target: 'Tulsi Labels', acquirer: 'Private equity', year: 2024, multiple: 10.8 },
      { target: 'Harbor Containers', acquirer: 'Strategic buyer', year: 2025, multiple: 12.2 },
    ],
  },
  {
    id: 'NMC', name: 'Nexa Mobility Components', sector: 'EV supply chain',
    revenue: 940, growth1: 0.2, growth5: 0.075, margin1: 0.115, margin5: 0.185,
    taxRate: 0.25, daPct: 0.05, capexPct: 0.078, nwcPct: 0.15,
    wacc: 0.145, terminalGrowth: 0.04, debt: 230, cash: 64, shares: 12.2,
    capm: { rf: 0.07, erp: 0.06, beta: 1.37, kd: 0.105, dv: 0.1 },
    peers: [
      { name: 'Voltline Cells', multiple: 9.8, growth: 0.14, margin: 0.11 },
      { name: 'Quanta Motors', multiple: 11.2, growth: 0.18, margin: 0.13 },
      { name: 'Ampere Harness', multiple: 12.6, growth: 0.21, margin: 0.14 },
      { name: 'Zenith Powertrain', multiple: 14.3, growth: 0.25, margin: 0.16 },
    ],
    precedents: [
      { target: 'Spark Thermal', acquirer: 'Strategic buyer', year: 2023, multiple: 12.4 },
      { target: 'Fluxion BMS', acquirer: 'Growth equity', year: 2024, multiple: 14.1 },
      { target: 'Rapid Charge Systems', acquirer: 'Strategic buyer', year: 2025, multiple: 15.2 },
    ],
  },
].map((c) => ({ ...c, peerMultiples: c.peers.map((p) => p.multiple), precedentMultiples: c.precedents.map((p) => p.multiple) }));

/** Scenario overlays: shifts applied to the base case assumptions. */
export const SCENARIOS = {
  bear: { name: 'Bear', growth: -0.04, margin: -0.025, wacc: 0.01, terminalGrowth: -0.005 },
  base: { name: 'Base', growth: 0, margin: 0, wacc: 0, terminalGrowth: 0 },
  bull: { name: 'Bull', growth: 0.03, margin: 0.02, wacc: -0.005, terminalGrowth: 0.005 },
};

const round = (n, d = 2) => Number(n.toFixed(d));
export function median(arr) {
  const s = [...arr].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const REQUIRED = ['revenue', 'growth1', 'growth5', 'margin1', 'margin5', 'taxRate', 'daPct', 'capexPct', 'nwcPct', 'wacc', 'terminalGrowth', 'debt', 'cash', 'shares'];
export function validateInputs(b) {
  for (const k of REQUIRED) if (typeof b[k] !== 'number' || !Number.isFinite(b[k])) throw Error(`Invalid input: ${k} must be a finite number.`);
  if (b.revenue <= 0 || b.shares <= 0) throw Error('Revenue and diluted shares must be positive.');
  if (b.debt < 0 || b.cash < 0) throw Error('Debt and cash cannot be negative.');
  for (const k of ['growth1', 'growth5']) if (b[k] < -0.5 || b[k] > 1) throw Error('Revenue growth must be between -50% and +100%.');
  for (const k of ['margin1', 'margin5']) if (b[k] < -0.3 || b[k] > 0.7) throw Error('EBIT margin must be between -30% and +70%.');
  if (b.taxRate < 0 || b.taxRate > 0.6) throw Error('Tax rate must be between 0% and 60%.');
  for (const k of ['daPct', 'capexPct', 'nwcPct']) if (b[k] < 0 || b[k] > 0.5) throw Error('D&A, capex and incremental NWC rates must be between 0% and 50%.');
  if (b.wacc <= 0.04 || b.wacc > 0.4) throw Error('WACC must be above 4% and at most 40%.');
  if (b.terminalGrowth < -0.03 || b.terminalGrowth > 0.08) throw Error('Terminal growth must be between -3% and 8%.');
  if (b.terminalGrowth >= b.wacc) throw Error('Terminal growth must be strictly below WACC.');
  if (!Array.isArray(b.peerMultiples) || !b.peerMultiples.length || !Array.isArray(b.precedentMultiples) || !b.precedentMultiples.length || [...b.peerMultiples, ...b.precedentMultiples].some((x) => !Number.isFinite(x) || x <= 0 || x > 100)) {
    throw Error('Valuation multiples must be positive and finite.');
  }
}

export function applyScenario(b, key = 'base') {
  const s = SCENARIOS[key];
  if (!s) throw Error('Unknown scenario.');
  return { ...b, growth1: b.growth1 + s.growth, growth5: b.growth5 + s.growth, margin1: b.margin1 + s.margin, margin5: b.margin5 + s.margin, wacc: b.wacc + s.wacc, terminalGrowth: b.terminalGrowth + s.terminalGrowth };
}

/** CAPM cost of equity and after-tax cost of debt, weighted by target debt / capital. */
export function waccBuild({ rf, erp, beta, kd, dv, taxRate }) {
  if ([rf, erp, beta, kd, dv, taxRate].some((x) => !Number.isFinite(x)) || dv < 0 || dv >= 1 || beta < 0 || taxRate < 0 || taxRate > 0.6) throw Error('Check the WACC inputs: debt weight must be from 0% to below 100%.');
  const costOfEquity = rf + beta * erp, afterTaxDebt = kd * (1 - taxRate);
  return { costOfEquity, afterTaxDebt, wacc: (1 - dv) * costOfEquity + dv * afterTaxDebt };
}

/** Five-year operating forecast. Growth and margin move linearly from year 1 to year 5. */
export function buildForecast(b, { midYear = false } = {}) {
  validateInputs(b);
  const rows = [];
  let previousRevenue = b.revenue;
  for (let year = 1; year <= 5; year++) {
    const t = (year - 1) / 4;
    const growth = b.growth1 + (b.growth5 - b.growth1) * t;
    const margin = b.margin1 + (b.margin5 - b.margin1) * t;
    const revenue = previousRevenue * (1 + growth);
    const ebit = revenue * margin, da = revenue * b.daPct, ebitda = ebit + da;
    const tax = ebit * b.taxRate, nopat = ebit - tax;
    const capex = revenue * b.capexPct, deltaNwc = (revenue - previousRevenue) * b.nwcPct;
    const ufcf = nopat + da - capex - deltaNwc;
    const period = midYear ? year - 0.5 : year;
    const discountFactor = 1 / (1 + b.wacc) ** period;
    rows.push({ year, growth, margin, revenue, ebit, ebitda, tax, nopat, da, capex, deltaNwc, ufcf, discountFactor, pv: ufcf * discountFactor });
    previousRevenue = revenue;
  }
  return rows;
}

/**
 * DCF to price per share. options may override any assumption plus:
 * terminalMethod 'gordon' | 'exit', exitMultiple (EV / EBITDA), midYear (boolean).
 */
export function calculateDcf(b, options = {}) {
  const { terminalMethod = 'gordon', exitMultiple, midYear = false, ...overrides } = options;
  const a = { ...b, ...overrides };
  const forecast = buildForecast(a, { midYear });
  const pvFcf = forecast.reduce((s, x) => s + x.pv, 0);
  const last = forecast.at(-1);
  let terminalValue;
  if (terminalMethod === 'exit') {
    if (!Number.isFinite(exitMultiple) || exitMultiple <= 0) throw Error('Exit multiple must be a positive number.');
    terminalValue = last.ebitda * exitMultiple;
  } else {
    terminalValue = (last.ufcf * (1 + a.terminalGrowth)) / (a.wacc - a.terminalGrowth);
  }
  const pvTerminal = terminalValue / (1 + a.wacc) ** 5;
  const enterpriseValue = pvFcf + pvTerminal, netDebt = a.debt - a.cash, equityValue = enterpriseValue - netDebt;
  // Cross-checks: what each terminal method implies about the other.
  const impliedExitMultiple = ((last.ufcf * (1 + a.terminalGrowth)) / (a.wacc - a.terminalGrowth)) / last.ebitda;
  const impliedPerpetualGrowth = (terminalValue * a.wacc - last.ufcf) / (terminalValue + last.ufcf);
  return {
    forecast, pvFcf, terminalValue, pvTerminal, enterpriseValue, netDebt, equityValue,
    pricePerShare: equityValue / a.shares, terminalShare: pvTerminal / enterpriseValue,
    impliedExitMultiple, impliedPerpetualGrowth, terminalMethod,
  };
}

export function multiplesValue(b, multiples, ebitda) {
  const netDebt = b.debt - b.cash;
  const values = multiples.map((m) => ({ multiple: m, enterpriseValue: m * ebitda, equityValue: m * ebitda - netDebt, pricePerShare: (m * ebitda - netDebt) / b.shares }));
  const medMultiple = median(multiples);
  return { values, medianMultiple: medMultiple, medianPrice: (medMultiple * ebitda - netDebt) / b.shares, low: Math.min(...values.map((v) => v.pricePerShare)), high: Math.max(...values.map((v) => v.pricePerShare)) };
}

/** 5×5 price grid: WACC (rows) × perpetual growth (columns). Centre cell = base case. */
export function sensitivityGrid(b, opts = {}) {
  const waccs = [-0.02, -0.01, 0, 0.01, 0.02].map((n) => b.wacc + n);
  const growths = [-0.01, -0.005, 0, 0.005, 0.01].map((n) => b.terminalGrowth + n);
  const cells = waccs.map((wacc) => growths.map((terminalGrowth) => (wacc <= terminalGrowth || wacc <= 0.04 ? null : calculateDcf(b, { ...opts, wacc, terminalGrowth }).pricePerShare)));
  return { waccs, growths, cells };
}

/** 5×5 price grid: WACC × exit EV/EBITDA multiple. */
export function exitGrid(b, exitMultiple, opts = {}) {
  const waccs = [-0.02, -0.01, 0, 0.01, 0.02].map((n) => b.wacc + n);
  const multiples = [-2, -1, 0, 1, 2].map((n) => exitMultiple + n).filter((m) => m > 0);
  const cells = waccs.map((wacc) => multiples.map((m) => (wacc <= 0.04 ? null : calculateDcf(b, { ...opts, wacc, terminalMethod: 'exit', exitMultiple: m }).pricePerShare)));
  return { waccs, multiples, cells };
}

/** One-at-a-time swings in price per share; sorted with the biggest driver first. */
export const TORNADO_DRIVERS = [
  { key: 'wacc', label: 'WACC ±1 pt', apply: (b, s) => ({ wacc: b.wacc + s * 0.01 }) },
  { key: 'tg', label: 'Terminal growth ±0.5 pt', apply: (b, s) => ({ terminalGrowth: b.terminalGrowth + s * 0.005 }) },
  { key: 'margin', label: 'EBIT margin ±2 pts', apply: (b, s) => ({ margin1: b.margin1 + s * 0.02, margin5: b.margin5 + s * 0.02 }) },
  { key: 'growth', label: 'Revenue growth ±2 pts', apply: (b, s) => ({ growth1: b.growth1 + s * 0.02, growth5: b.growth5 + s * 0.02 }) },
  { key: 'capex', label: 'Capex / sales ±1 pt', apply: (b, s) => ({ capexPct: Math.max(0, b.capexPct + s * 0.01) }) },
  { key: 'nwc', label: 'NWC / incremental sales ±3 pts', apply: (b, s) => ({ nwcPct: Math.max(0, b.nwcPct + s * 0.03) }) },
  { key: 'tax', label: 'Tax rate ±3 pts', apply: (b, s) => ({ taxRate: Math.max(0, b.taxRate + s * 0.03) }) },
];
export function tornado(b, opts = {}) {
  const base = calculateDcf(b, opts).pricePerShare;
  return TORNADO_DRIVERS.map((d) => {
    const up = calculateDcf(b, { ...opts, ...d.apply(b, 1) }).pricePerShare;
    const down = calculateDcf(b, { ...opts, ...d.apply(b, -1) }).pricePerShare;
    return { key: d.key, label: d.label, low: Math.min(up, down), high: Math.max(up, down), up, down, swing: Math.abs(up - down), base };
  }).sort((x, y) => y.swing - x.swing);
}

/** Linked three-statement forecast driven by the same operating forecast as the DCF. */
export function linkedStatements(b, { interestRate = 0.09, repayment = 30, ppeToSales = 0.36, payout = 0 } = {}) {
  const f = buildForecast(b);
  let cash = b.cash, debt = b.debt, ppe = b.revenue * ppeToSales, nwc = b.revenue * b.nwcPct;
  let equity = cash + ppe + nwc - debt;
  const opening = { cash, debt, ppe, nwc, equity };
  const rows = f.map((x) => {
    const interest = debt * interestRate, ebt = x.ebit - interest, tax = Math.max(0, ebt) * b.taxRate, netIncome = ebt - tax;
    const newNwc = x.revenue * b.nwcPct, changeNwc = newNwc - nwc;
    const cfo = netIncome + x.da - changeNwc, cfi = -x.capex;
    const principal = Math.min(repayment, debt), dividends = Math.max(0, netIncome) * payout, cff = -principal - dividends;
    cash += cfo + cfi + cff; ppe += x.capex - x.da; nwc = newNwc; debt -= principal; equity += netIncome - dividends;
    return { year: x.year, revenue: x.revenue, ebitda: x.ebitda, da: x.da, ebit: x.ebit, interest, ebt, tax, netIncome, cfo, cfi, cff, dividends, netChange: cfo + cfi + cff, cash, ppe, nwc, debt, equity, totalAssets: cash + ppe + nwc, balanceCheck: cash + ppe + nwc - debt - equity, leverage: debt / Math.max(1e-9, x.ebitda) };
  });
  return { opening, rows };
}

/** Original simplified statement model (constant growth/margin), kept for compatibility. */
export function statementModel({ revenue, growth, margin, daPct, capexPct, nwcPct, tax, interestRate, debt, repayment, cash, ppe, nwc, equity }) {
  if ([revenue, growth, margin, daPct, capexPct, nwcPct, tax, interestRate, debt, repayment, cash, ppe, nwc, equity].some((x) => !Number.isFinite(x)) || revenue <= 0 || growth <= -1 || [daPct, capexPct, nwcPct, tax, interestRate].some((x) => x < 0 || x > 1) || [debt, repayment, cash, ppe, nwc].some((x) => x < 0) || Math.abs(cash + ppe + nwc - debt - equity) > 1e-6) throw Error('Opening balance sheet must balance; review assumptions');
  const rows = [];
  for (let year = 1; year <= 5; year++) {
    revenue *= 1 + growth;
    const ebit = revenue * margin, da = revenue * daPct, capex = revenue * capexPct, interest = debt * interestRate, ebt = ebit - interest, netIncome = ebt - Math.max(0, ebt) * tax, newNwc = revenue * nwcPct, changeNwc = newNwc - nwc, cfo = netIncome + da - changeNwc, principal = Math.min(repayment, debt), cfi = -capex, cff = -principal;
    cash += cfo + cfi + cff; ppe += capex - da; nwc = newNwc; debt -= principal; equity += netIncome;
    if (ppe < 0) throw Error('Negative net PPE: revise depreciation assumptions');
    rows.push({ year, revenue, ebit, interest, netIncome, cfo, cfi, cff, cash, ppe, nwc, debt, equity, balanceCheck: cash + ppe + nwc - debt - equity, fundingGap: Math.max(0, -cash) });
  }
  return rows;
}

/** Everything one company view needs. scenario: 'bear' | 'base' | 'bull'. */
export function analyzeCompany(input, { scenario = 'base', midYear = false } = {}) {
  const b = applyScenario(input, scenario);
  const opts = { midYear };
  const dcf = calculateDcf(b, opts);
  const forwardEbitda = dcf.forecast[0].ebitda;
  const trading = multiplesValue(b, b.peerMultiples, forwardEbitda);
  const transactions = multiplesValue(b, b.precedentMultiples, forwardEbitda);
  const exitMultiple = round(median(b.peerMultiples), 1);
  const exitDcf = calculateDcf(b, { ...opts, terminalMethod: 'exit', exitMultiple });
  const sensitivity = sensitivityGrid(b, opts);
  const exitSensitivity = exitGrid(b, exitMultiple, opts);
  const inner = (g) => g.cells.slice(1, 4).flatMap((r) => r.slice(1, 4)).filter((v) => v !== null);
  const scen = Object.keys(SCENARIOS).map((k) => ({ key: k, name: SCENARIOS[k].name, price: calculateDcf(applyScenario(input, k), opts).pricePerShare }));
  const football = [
    { key: 'dcf', label: 'DCF, perpetual growth', note: 'WACC ±1 pt, g ±0.5 pt', lo: Math.min(...inner(sensitivity)), hi: Math.max(...inner(sensitivity)), mid: dcf.pricePerShare },
    { key: 'exit', label: 'DCF, exit multiple', note: `WACC ±1 pt, ${exitMultiple - 1}–${exitMultiple + 1}× EBITDA`, lo: Math.min(...inner(exitSensitivity)), hi: Math.max(...inner(exitSensitivity)), mid: exitDcf.pricePerShare },
    { key: 'trading', label: 'Trading comparables', note: `${Math.min(...b.peerMultiples)}–${Math.max(...b.peerMultiples)}× forward EBITDA`, lo: trading.low, hi: trading.high, mid: trading.medianPrice },
    { key: 'precedents', label: 'Precedent transactions', note: `${Math.min(...b.precedentMultiples)}–${Math.max(...b.precedentMultiples)}× forward EBITDA`, lo: transactions.low, hi: transactions.high, mid: transactions.medianPrice },
    { key: 'scenarios', label: 'Bear to bull scenarios', note: 'Perpetual-growth DCF', lo: Math.min(...scen.map((s) => s.price)), hi: Math.max(...scen.map((s) => s.price)), mid: scen.find((s) => s.key === 'base').price },
  ];
  const flags = [];
  if (dcf.terminalShare > 0.75) flags.push(`Terminal value is ${(dcf.terminalShare * 100).toFixed(1)}% of enterprise value, so the answer leans heavily on long-run assumptions.`);
  if (Math.abs(dcf.impliedExitMultiple - exitMultiple) / exitMultiple > 0.25) flags.push(`The perpetual-growth terminal value implies ${dcf.impliedExitMultiple.toFixed(1)}× EBITDA against a peer median of ${exitMultiple.toFixed(1)}×; the two methods disagree by more than 25%.`);
  if (dcf.equityValue <= 0) flags.push('DCF equity value is zero or negative under these assumptions; review leverage and inputs.');
  if (dcf.forecast.some((x) => x.ufcf < 0)) flags.push('Unlevered free cash flow is negative in at least one forecast year.');
  if (transactions.medianPrice > trading.medianPrice) flags.push(`Precedent deals sit ${(((transactions.medianPrice / trading.medianPrice) - 1) * 100).toFixed(0)}% above trading comps, consistent with a control premium.`);
  flags.push('Peer and transaction multiples are invented teaching data, not verified market observations.');
  return { company: b, scenario, dcf, exitDcf, exitMultiple, trading, transactions, sensitivity, exitSensitivity, tornado: tornado(b, opts), scenarios: scen, football, statements: linkedStatements(b), wacc: waccBuild({ ...b.capm, taxRate: b.taxRate }), flags, forwardEbitda };
}

export function forecastCsv(a) {
  return [
    ['Year', 'Revenue (INR crore)', 'YoY revenue growth', 'EBIT margin', 'EBIT', 'D&A', 'EBITDA', 'NOPAT', 'Capex', 'Change NWC', 'UFCF', 'PV of UFCF'].join(','),
    ...a.dcf.forecast.map((x) => [x.year, x.revenue, x.growth, x.margin, x.ebit, x.da, x.ebitda, x.nopat, x.capex, x.deltaNwc, x.ufcf, x.pv].map((n, i) => (i === 0 ? n : round(n, 5))).join(',')),
  ].join('\n');
}

export function valuationMemo(a) {
  const b = a.company, d = a.dcf, f = (x) => Number(x).toFixed(2), p = (x) => `${(x * 100).toFixed(1)}%`;
  return [
    `MERIDIAN | VALUATION MEMO — ${b.name} (${b.id}), ${b.sector}`,
    `Scenario: ${SCENARIOS[a.scenario].name}. SYNTHETIC COMPANY, PEERS AND TRANSACTIONS — NOT INVESTMENT ADVICE.`,
    'Currency: INR crore, except INR per share.',
    '',
    'SUMMARY',
    `DCF (perpetual growth) value per share: INR ${f(d.pricePerShare)}`,
    `DCF (exit at ${a.exitMultiple.toFixed(1)}x EBITDA) value per share: INR ${f(a.exitDcf.pricePerShare)}`,
    `Trading comparables median: INR ${f(a.trading.medianPrice)}   Precedent transactions median: INR ${f(a.transactions.medianPrice)}`,
    `Enterprise value ${f(d.enterpriseValue)} less net debt ${f(d.netDebt)} = equity value ${f(d.equityValue)}.`,
    '',
    'VALUATION RANGE (football field)',
    ...a.football.map((r) => `${r.label.padEnd(26)} INR ${f(r.lo)} – ${f(r.hi)}   (${r.note})`),
    '',
    'METHOD',
    `Revenue growth fades from ${p(b.growth1)} to ${p(b.growth5)}; EBIT margin moves from ${p(b.margin1)} to ${p(b.margin5)}.`,
    `UFCF = EBIT x (1 - tax) + D&A - capex - change in NWC. WACC ${p(b.wacc)} (CAPM build: ${p(a.wacc.wacc)}); perpetual growth ${p(b.terminalGrowth)}.`,
    `Terminal value is ${p(d.terminalShare)} of EV and implies ${d.impliedExitMultiple.toFixed(1)}x terminal-year EBITDA.`,
    '',
    'FORECAST (INR crore)',
    ['Year', 'Revenue', 'EBITDA', 'EBIT', 'UFCF', 'PV'].join('\t'),
    ...d.forecast.map((x) => [x.year, f(x.revenue), f(x.ebitda), f(x.ebit), f(x.ufcf), f(x.pv)].join('\t')),
    '',
    'BIGGEST VALUE DRIVERS',
    ...a.tornado.slice(0, 3).map((t) => `${t.label}: INR ${f(t.low)} to ${f(t.high)}`),
    '',
    'REVIEW POINTS',
    ...a.flags.map((x, i) => `${i + 1}. ${x}`),
    '',
    'LIMITATIONS',
    'All financials, share counts, peers and deals are constructed sample data. No live filings, fairness opinion, deal mandate or recommendation. A real engagement would verify audited financials, normalise EBITDA, build WACC from observed betas and source comparables independently.',
  ].join('\n');
}
