/* Meridian: an auditable, hypothetical unlevered DCF + public comps / precedent multiples model.
 * Figures: INR crore unless explicitly stated. Synthetic cases, never market recommendations.
 */
export const COMPANIES = [
  {
    id:'HPS', name:'Helios Precision Systems', sector:'Industrial components',
    revenue:1250, growth1:0.12, growth5:0.06, margin1:0.17, margin5:0.205,
    taxRate:0.25, daPct:0.038, capexPct:0.057, nwcPct:0.11,
    wacc:0.115, terminalGrowth:0.035, debt:260, cash:95, shares:16.5,
    peerMultiples:[8.7,10.1,10.8,12.0], precedentMultiples:[11.2,12.6,13.4]
  },
  {
    id:'SFP', name:'Saffron Food Packaging', sector:'Consumer packaging',
    revenue:680, growth1:0.09, growth5:0.045, margin1:0.135, margin5:0.155,
    taxRate:0.255, daPct:0.032, capexPct:0.045, nwcPct:0.09,
    wacc:0.13, terminalGrowth:0.03, debt:125, cash:43, shares:10.4,
    peerMultiples:[7.6,8.9,9.5,10.7], precedentMultiples:[9.6,10.8,12.2]
  },
  {
    id:'NMC', name:'Nexa Mobility Components', sector:'EV supply chain',
    revenue:940, growth1:0.20, growth5:0.075, margin1:0.115, margin5:0.185,
    taxRate:0.25, daPct:0.05, capexPct:0.078, nwcPct:0.15,
    wacc:0.145, terminalGrowth:0.04, debt:230, cash:64, shares:12.2,
    peerMultiples:[9.8,11.2,12.6,14.3], precedentMultiples:[12.4,14.1,15.2]
  }
];
const round=(n,d=2)=>Number(n.toFixed(d));
function median(arr){const sorted=[...arr].sort((a,b)=>a-b),m=Math.floor(sorted.length/2);return sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2;}
const REQUIRED=['revenue','growth1','growth5','margin1','margin5','taxRate','daPct','capexPct','nwcPct','wacc','terminalGrowth','debt','cash','shares'];
export function validateInputs(b){
  for(const k of REQUIRED)if(typeof b[k]!=='number'||!Number.isFinite(b[k]))throw Error(`Invalid input: ${k} must be a finite number.`);
  if(b.revenue<=0||b.shares<=0)throw Error('Revenue and diluted shares must be positive.');
  if(b.debt<0||b.cash<0)throw Error('Debt and cash cannot be negative.');
  for(const k of ['growth1','growth5'])if(b[k]<-0.5||b[k]>1)throw Error('Revenue growth must be between -50% and +100%.');
  for(const k of ['margin1','margin5'])if(b[k]<-0.3||b[k]>.7)throw Error('EBIT margin must be between -30% and +70%.');
  if(b.taxRate<0||b.taxRate>.6)throw Error('Tax rate must be between 0% and 60%.');
  for(const k of ['daPct','capexPct','nwcPct'])if(b[k]<0||b[k]>.5)throw Error('D&A, capex and incremental NWC rates must be between 0% and 50%.');
  if(b.wacc<=0.04||b.wacc>.4)throw Error('WACC must be above 4% and at most 40%.');
  if(b.terminalGrowth<-.03||b.terminalGrowth>.08)throw Error('Terminal growth must be between -3% and 8%.');
  if(b.terminalGrowth>=b.wacc)throw Error('Terminal growth must be strictly below WACC.');
  if(!Array.isArray(b.peerMultiples)||!b.peerMultiples.length||!Array.isArray(b.precedentMultiples)||!b.precedentMultiples.length || [...b.peerMultiples,...b.precedentMultiples].some(x=>!Number.isFinite(x)||x<=0||x>100))throw Error('Valuation multiples must be positive and finite.');
}
export function buildForecast(b){
  validateInputs(b);
  const rows=[];let previousRevenue=b.revenue;
  for(let year=1;year<=5;year++){
    const t=(year-1)/4;
    const growth=b.growth1+(b.growth5-b.growth1)*t;
    const margin=b.margin1+(b.margin5-b.margin1)*t;
    const revenue=previousRevenue*(1+growth);
    const ebit=revenue*margin;
    const da=revenue*b.daPct;
    const ebitda=ebit+da;
    const nopat=ebit*(1-b.taxRate);
    const capex=revenue*b.capexPct;
    const deltaNwc=(revenue-previousRevenue)*b.nwcPct;
    const ufcf=nopat+da-capex-deltaNwc;
    rows.push({year,growth,margin,revenue,ebit,ebitda,nopat,da,capex,deltaNwc,ufcf,pv:ufcf/Math.pow(1+b.wacc,year)});
    previousRevenue=revenue;
  }
  return rows;
}
export function calculateDcf(b,options={}){
  const adjusted={...b,...options};
  const forecast=buildForecast(adjusted);
  const pvFcf=forecast.reduce((a,x)=>a+x.pv,0);
  const last=forecast.at(-1);
  const tv=last.ufcf*(1+adjusted.terminalGrowth)/(adjusted.wacc-adjusted.terminalGrowth);
  const pvTerminal=tv/Math.pow(1+adjusted.wacc,5);
  const enterpriseValue=pvFcf+pvTerminal;
  const netDebt=adjusted.debt-adjusted.cash;
  const equityValue=enterpriseValue-netDebt;
  const pricePerShare=equityValue/adjusted.shares;
  return {forecast,pvFcf,terminalValue:tv,pvTerminal,enterpriseValue,netDebt,equityValue,pricePerShare,terminalShare:pvTerminal/enterpriseValue};
}
export function multiplesValue(b,multiples,ebitda){
  const values=multiples.map(m=>({multiple:m,enterpriseValue:m*ebitda,equityValue:m*ebitda-(b.debt-b.cash),pricePerShare:(m*ebitda-(b.debt-b.cash))/b.shares}));
  const medMultiple=median(multiples);
  return {values,medianMultiple:medMultiple,medianPrice:(medMultiple*ebitda-(b.debt-b.cash))/b.shares};
}
export function sensitivityGrid(b){
  const waccShifts=[-.02,-.01,0,.01,.02],growthShifts=[-.01,-.005,0,.005,.01];
  const growths=growthShifts.map(n=>b.terminalGrowth+n),waccs=waccShifts.map(n=>b.wacc+n);
  const cells=waccs.map(wacc=>growths.map(terminalGrowth=> wacc<=terminalGrowth || wacc<=.04 ? null : calculateDcf(b,{wacc,terminalGrowth}).pricePerShare));
  return {waccs,growths,cells};
}
export function analyzeCompany(b){
  const dcf=calculateDcf(b);
  const forwardEbitda=dcf.forecast[0].ebitda;
  const trading=multiplesValue(b,b.peerMultiples,forwardEbitda);
  const transactions=multiplesValue(b,b.precedentMultiples,forwardEbitda);
  const sensitivity=sensitivityGrid(b);
  const flags=[];
  if(dcf.terminalShare>.75)flags.push(`Terminal value represents ${(dcf.terminalShare*100).toFixed(1)}% of enterprise value; sensitivity to terminal assumptions is high.`);
  if(dcf.equityValue<=0)flags.push('DCF equity value is non-positive under these assumptions; review leverage and model inputs.');
  if(dcf.forecast.some(x=>x.ufcf<0))flags.push('Projected negative unlevered FCF in one or more forecast years.');
  flags.push('Trading and transaction multiples are fabricated educational observations, not independently verified market comparables.');
  return {company:b,dcf,trading,transactions,sensitivity,flags,forwardEbitda};
}
export function forecastCsv(a){
  return [
    ['Year','Revenue (INR crore)','YoY revenue growth','EBIT margin','EBIT','D&A','EBITDA','NOPAT','Capex','Change NWC','UFCF','PV of UFCF'].join(','),
    ...a.dcf.forecast.map(x=>[x.year,x.revenue,x.growth,x.margin,x.ebit,x.da,x.ebitda,x.nopat,x.capex,x.deltaNwc,x.ufcf,x.pv].map((n,i)=>i===0?n:round(n,5)).join(','))
  ].join('\n');
}
export function valuationMemo(a){
  const b=a.company,d=a.dcf,f= x=>Number(x).toFixed(2);
  return `MERIDIAN | INVESTMENT-STYLE VALUATION MEMO\n${b.name} (${b.id}) · ${b.sector}\nSYNTHETIC COMPANY, PEERS AND TRANSACTIONS — NOT INVESTMENT ADVICE\nCurrency: INR crore, except INR per share.\n\nEXECUTIVE SUMMARY\nUnlevered DCF enterprise value: INR ${f(d.enterpriseValue)} crore\nLess debt + cash bridge / net debt: INR ${f(d.netDebt)} crore\nIllustrative equity value: INR ${f(d.equityValue)} crore\nDCF implied share value: INR ${f(d.pricePerShare)}\nTrading-comparables median implied share value: INR ${f(a.trading.medianPrice)}\nPrecedent-transactions median implied share value: INR ${f(a.transactions.medianPrice)}\n\nFORECAST METHODOLOGY\nFive-year revenue growth fades linearly from ${f(b.growth1*100)}% to ${f(b.growth5*100)}%.\nEBIT margins improve / decline linearly from ${f(b.margin1*100)}% to ${f(b.margin5*100)}%.\nNOPAT = EBIT x (1 - tax rate). UFCF = NOPAT + D&A - capex - change in NWC.\nD&A = ${f(b.daPct*100)}% of sales; capex = ${f(b.capexPct*100)}% of sales; increase in NWC = ${f(b.nwcPct*100)}% of incremental revenue.\nWACC = ${f(b.wacc*100)}%; perpetual UFCF growth = ${f(b.terminalGrowth*100)}%.\nDiscounting: end-of-year FCFs; Gordon-growth terminal at end of year 5.\nPV of FCF: ${f(d.pvFcf)}; PV of terminal value: ${f(d.pvTerminal)}; terminal share of EV: ${f(d.terminalShare*100)}%.\n\nFIVE-YEAR OPERATING MODEL (INR crore)\n${['Year','Revenue','EBIT','EBITDA','UFCF'].join('\t')}\n${d.forecast.map(x=>[x.year,f(x.revenue),f(x.ebit),f(x.ebitda),f(x.ufcf)].join('\t')).join('\n')}\n\nVALUATION CROSS-CHECKS\nPeer EV / forward EBITDA multiples (fictional): ${b.peerMultiples.join('x, ')}x; median ${f(a.trading.medianMultiple)}x.\nPrecedent EV / forward EBITDA multiples (fictional): ${b.precedentMultiples.join('x, ')}x; median ${f(a.transactions.medianMultiple)}x.\n\nKEY REVIEW ITEMS\n${a.flags.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\nLIMITATIONS AND GOVERNANCE\nFinancial statements, share counts, capital structure, peer multiples, transaction multiples and growth assumptions are constructed sample data. No live filings, investment decisions, financial advice, actual deal execution, fairness opinion or claim of prior investment-banking employment. Source financials, normalisations, working capital schedules, cost-of-capital analysis and peer selection must be verified before any real use.`;
}
