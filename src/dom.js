/* Small DOM + formatting helpers shared by the UI layer (no calculation logic lives here). */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
export const num = (v, d = 0) => (Number.isFinite(v) ? Number(v).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
export const pct = (v, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—');
export const times = (v, d = 2) => (Number.isFinite(v) ? `${v.toFixed(d)}×` : '—');

/** Indian rupee in lakh/crore, the way an Indian finance team would write it. */
export function rupees(v, { short = true, d = 1 } = {}) {
  if (!Number.isFinite(v)) return '—';
  const sign = v < 0 ? '−' : '', a = Math.abs(v);
  if (!short) return `${sign}₹${inr.format(a)}`;
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(d)} L`;
  return `${sign}₹${inr.format(a)}`;
}

export function download(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Minimal hash router: each <section data-view="x"> is a page; nav links use href="#x". */
export function router(views, onChange) {
  const ids = views.map((v) => v.dataset.view);
  const show = () => {
    const id = ids.includes(location.hash.slice(1)) ? location.hash.slice(1) : ids[0];
    for (const v of views) v.hidden = v.dataset.view !== id;
    for (const a of $$('[data-nav]')) { if (a.getAttribute('href') === `#${id}`) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
    onChange?.(id);
  };
  addEventListener('hashchange', () => { show(); scrollTo({ top: 0 }); });
  show();
}

/** Read a numeric form field; percent fields are entered as 12.5 and returned as 0.125. */
export function field(id, { percent = false } = {}) {
  const el = document.getElementById(id);
  const v = Number(el.value);
  if (el.value === '' || !Number.isFinite(v)) throw Error(`${el.labels?.[0]?.textContent?.trim() || id} needs a number.`);
  return percent ? v / 100 : v;
}
