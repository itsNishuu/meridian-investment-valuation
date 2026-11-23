import test from 'node:test';
import assert from 'node:assert/strict';
import {COMPANIES,buildForecast,calculateDcf,multiplesValue,sensitivityGrid,analyzeCompany,forecastCsv,valuationMemo} from '../engine.js';
const approx=(actual,expected,epsilon=1e-7)=>assert.ok(Math.abs(actual-expected)<epsilon,`expected ${actual} ≈ ${expected}`);

test('Meridian: forecast follows correct top-line, UFCF and discounting math',()=>{
 const b=COMPANIES[0],f=buildForecast(b);
 assert.equal(f.length,5);approx(f[0].revenue,b.revenue*(1+b.growth1));
 const x=f[0];approx(x.ufcf,x.ebit*(1-b.taxRate)+x.da-x.capex-x.deltaNwc);
 approx(x.pv,x.ufcf/(1+b.wacc));
});
test('Meridian: DCF reconciles terminal, enterprise, equity and per-share value',()=>{
 const b=COMPANIES[0],x=calculateDcf(b);
 approx(x.enterpriseValue,x.pvFcf+x.pvTerminal);
 approx(x.equityValue,x.enterpriseValue-b.debt+b.cash);
 approx(x.pricePerShare,x.equityValue/b.shares);
 assert.ok(x.terminalShare>0&&x.terminalShare<1);
});
test('Meridian: increasing WACC lowers valuation; increasing terminal growth raises it',()=>{
 const b=COMPANIES[0],base=calculateDcf(b).pricePerShare;
 assert.ok(calculateDcf(b,{wacc:b.wacc+.01}).pricePerShare<base);
 assert.ok(calculateDcf(b,{terminalGrowth:b.terminalGrowth+.005}).pricePerShare>base);
});
test('Meridian: sensitivity center equals base; peer median calculated correctly',()=>{
 const b=COMPANIES[1],s=sensitivityGrid(b);
 approx(s.cells[2][2],calculateDcf(b).pricePerShare);
 const m=multiplesValue(b,[8,12,10,14],100);
 approx(m.medianMultiple,11);approx(m.medianPrice,(1100-b.debt+b.cash)/b.shares);
});
test('Meridian: produces memo + CSV, refuses invalid terminal growth and NaN',()=>{
 const b=COMPANIES[2],a=analyzeCompany(b);
 assert.ok(valuationMemo(a).includes('SYNTHETIC COMPANY'));
 assert.equal(forecastCsv(a).split('\n').length,6);
 assert.throws(()=>calculateDcf({...b,wacc:.06,terminalGrowth:.06}),/below WACC/);
 assert.throws(()=>calculateDcf({...b,wacc:NaN}),/finite number/);
});
