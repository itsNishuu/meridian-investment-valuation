// Presentation layer only. All model calculations remain in each project's engine.js.
const rootUrl = new URL('../', import.meta.url);
const route = location.pathname;
const page = document.body.dataset.project || (route.includes('/credence/') ? 'credence' : route.includes('/aurel/') ? 'aurel' : route.includes('/meridian/') ? 'meridian' : 'home');
const pages = {
  home: { name:'Finance Labs', tag:'Research portfolio', mark:'NL', type:'3 connected finance labs', modules:['Finance analytics', 'Wealth modelling', 'Enterprise valuation'] },
  credence: { name:'Credence', tag:'Lending intelligence', mark:'CR', type:'MSME credit research', modules:['3 synthetic loan cases', '6 monitoring dimensions', 'CFADS downside scenario'] },
  aurel: { name:'Aurel', tag:'Private wealth', mark:'AU', type:'Portfolio analytics', modules:['4 asset classes', '1,000 simulated paths', 'Rebalancing worksheet'] },
  meridian: { name:'Meridian', tag:'Valuation research', mark:'MD', type:'Investment valuation', modules:['5 forecast years', 'DCF & valuation comps', '5 × 5 sensitivity'] }
};
const here=pages[page];
document.body.classList.add('with-rail','theme-'+page);
const sidebar = document.createElement('aside'); sidebar.className='rail';
sidebar.setAttribute('aria-label','Finance labs navigation');
const allNavItems = [['home','Overview','⌂',''],['credence','Credence','◈','credence/'],['aurel','Aurel','◎','aurel/'],['meridian','Meridian','▤','meridian/']];
const navItems = document.body.dataset.standalone === 'true' ? [[page, pages[page].name, '◈', '']] : allNavItems;
sidebar.innerHTML = `<a href="${rootUrl.href}" class="rail-identity"><span class="rail-symbol">NL</span><span><strong>NISHANT<span class="accent">.</span></strong><small>FINANCE RESEARCH LABS</small></span></a>
  <div class="rail-section-label">RESEARCH WORKSPACES</div>
  <nav class="rail-nav">${navItems.map(([id,title,glyph,sub],i)=>`<a href="${new URL(sub,rootUrl).href}" class="rail-link ${page===id?'selected':''}" ${page===id?'aria-current="page"':''}><span class="rail-glyph">${glyph}</span><span class="rail-link-text">${title}<small>${pages[id].tag}</small></span>${page===id?'<span class="rail-active-dot"></span>':''}</a>`).join('')}</nav>
  <div class="rail-bottom"><div class="rail-demo"><span class="demo-pulse"></span><span>EDUCATIONAL DEMO</span></div><p>Models use fictional and hypothetical data. No client records or live market feeds.</p><span class="rail-credit">© 2026 · Independent portfolio work</span></div>`;
document.body.prepend(sidebar);
const top=document.querySelector('.top');
if(top){ const right=document.createElement('div');right.className='top-badge';right.innerHTML=`<span class="top-dot"></span> INTERACTIVE WORKBENCH <span class="top-divider"></span> SYNTHETIC DATA`;top.append(right); }
const hero=document.querySelector('.hero');
if(hero){const ticker=document.createElement('div');ticker.className='hero-markers';ticker.innerHTML=`<span class="hero-category">${here.type}</span><span>INDEPENDENT CASE STUDY</span><span>REPRODUCIBLE OUTPUTS</span>`;hero.append(ticker)}
if(page!=='home'){
 const info=document.querySelector('.info');
 if(info){const summary=document.createElement('section');summary.className='product-summary';summary.setAttribute('aria-label','Project features');summary.innerHTML=here.modules.map((m,i)=>`<div class="summary-item"><small>0${i+1} / ${['SCOPE','METHOD','DELIVERABLE'][i]}</small><strong>${m}</strong></div>`).join('');info.after(summary)}
}
