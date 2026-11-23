import {COMPANIES,analyzeCompany,valuationMemo,forecastCsv} from './engine.js';
import {$,fmt,download,simpleLine,barRows,esc} from './shared/ui.js';
const numberKeys=['revenue','shares','debt','cash'];
const percentKeys=['growth1','growth5','margin1','margin5','taxRate','daPct','capexPct','nwcPct','wacc','terminalGrowth'];
let analysis;
$('#company').innerHTML=COMPANIES.map((b,i)=>`<option value="${i}">${esc(b.id)} · ${esc(b.name)}</option>`).join('');
function reset(){const b=COMPANIES[Number($('#company').value)];for(const k of numberKeys)document.getElementById(k).value=b[k];for(const k of percentKeys)document.getElementById(k).value=+(b[k]*100).toFixed(3);revalue();}
function formatPrice(v){return Number.isFinite(v)?'₹'+fmt(v,2):'—';}
function revalue(){
 try{
  const b={...COMPANIES[Number($('#company').value)]};
  for(const k of numberKeys){if(document.getElementById(k).value==='')throw Error(`Please provide ${k}.`);b[k]=Number(document.getElementById(k).value)}
  for(const k of percentKeys){if(document.getElementById(k).value==='')throw Error(`Please provide ${k}.`);b[k]=Number(document.getElementById(k).value)/100}
  analysis=analyzeCompany(b);$('#err').hidden=true;
  const d=analysis.dcf;
  $('#share').textContent=formatPrice(d.pricePerShare);
  $('#enterprise').textContent='₹'+fmt(d.enterpriseValue,0)+'cr';
  $('#trading').textContent=formatPrice(analysis.trading.medianPrice);
  $('#precedents').textContent=formatPrice(analysis.transactions.medianPrice);
  $('#pvFcf').textContent='₹'+fmt(d.pvFcf,1)+' cr';
  $('#pvTerminal').textContent='₹'+fmt(d.pvTerminal,1)+' cr';
  $('#netDebt').textContent='₹'+fmt(d.netDebt,1)+' cr';
  $('#tvShare').textContent=fmt(d.terminalShare*100,1)+'%';
  $('#forecast').innerHTML=d.forecast.map(x=>`<tr><td>FY+${x.year}</td><td>${fmt(x.revenue,1)}</td><td>${fmt(x.growth*100,1)}%</td><td>${fmt(x.margin*100,1)}%</td><td>${fmt(x.ebitda,1)}</td><td>${fmt(x.ufcf,1)}</td><td>${fmt(x.pv,1)}</td></tr>`).join('');
  simpleLine('revenuePath',[b.revenue,...d.forecast.map(x=>x.revenue)],{labels:['Base year','FY+5'],color:'#f4c778'});
  simpleLine('fcfPath',d.forecast.map(x=>x.ufcf),{labels:['FY+1','FY+5'],color:'#63e6c1'});
  const sens=analysis.sensitivity;
  $('#sensitivityHead').innerHTML='<tr><th>WACC / g</th>'+sens.growths.map(g=>`<th>${fmt(g*100,1)}%</th>`).join('')+'</tr>';
  const base=d.pricePerShare;
  $('#sensitivityBody').innerHTML=sens.cells.map((row,i)=>`<tr><th>${fmt(sens.waccs[i]*100,1)}%</th>`+row.map((val,j)=>`<td class="${i===2&&j===2?'basecell':''}" style="${val!==null?`background:rgba(${val>=base?'72,160,141':'201,121,120'},${Math.max(.02,Math.min(.27,Math.abs(val-base)/Math.max(1,Math.abs(base))*.22))})`:''}">${val===null?'N/A':fmt(val,1)}</td>`).join('')+'</tr>').join('');
  $('#peerRows').innerHTML=barRows(analysis.trading.values.map((x,i)=>({label:`Peer ${String.fromCharCode(65+i)} · ${fmt(x.multiple,1)}x`,value:x.multiple})),18);
  $('#transactionRows').innerHTML=barRows(analysis.transactions.values.map((x,i)=>({label:`Transaction ${i+1} · ${fmt(x.multiple,1)}x`,value:x.multiple})),18);
  $('#alerts').innerHTML='<strong>Analyst review items</strong><ul>'+analysis.flags.map(f=>`<li>${esc(f)}</li>`).join('')+'</ul>';
  $('#memo').textContent=valuationMemo(analysis);
 }catch(err){analysis=null;$('#err').hidden=false;$('#err').textContent=err.message}
}
$('#company').addEventListener('change',reset);
$('#reset').addEventListener('click',reset);
$('#run').addEventListener('click',revalue);
$('#downloadCsv').addEventListener('click',()=>{if(analysis)download(`meridian-${analysis.company.id}-forecast.csv`,forecastCsv(analysis),'text/csv')});
$('#downloadMemo').addEventListener('click',()=>{if(analysis)download(`meridian-${analysis.company.id}-valuation-memo.txt`,valuationMemo(analysis))});
reset();
