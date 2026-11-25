// Prints the web engine's results for every company x scenario x discounting convention, as JSON.
// excel/verify_workbook.py compares the recalculated workbook against this output.
import { COMPANIES, analyzeCompany } from '../src/engine.js';

const out = [];
for (const [ci, c] of COMPANIES.entries()) {
  for (const scenario of ['bear', 'base', 'bull']) {
    for (const midYear of [false, true]) {
      const a = analyzeCompany(c, { scenario, midYear });
      const d = a.dcf;
      out.push({
        company: ci + 1, scenario, midYear,
        revenue: d.forecast.map((x) => x.revenue), ufcf: d.forecast.map((x) => x.ufcf), pv: d.forecast.map((x) => x.pv),
        terminalValue: d.terminalValue, enterpriseValue: d.enterpriseValue, equityValue: d.equityValue,
        price: d.pricePerShare, terminalShare: d.terminalShare, impliedExitMultiple: d.impliedExitMultiple,
        exitMultiple: a.exitMultiple, exitPrice: a.exitDcf.pricePerShare,
        tradingMedian: a.trading.medianPrice, precedentMedian: a.transactions.medianPrice,
        grid: a.sensitivity.cells, exitGrid: a.exitSensitivity.cells,
        football: a.football.map((f) => [f.lo, f.hi, f.mid]),
        wacc: a.wacc.wacc,
        statements: a.statements.rows.map((r) => ({ netIncome: r.netIncome, cash: r.cash, debt: r.debt, equity: r.equity, balanceCheck: r.balanceCheck })),
      });
    }
  }
}
console.log(JSON.stringify(out));
