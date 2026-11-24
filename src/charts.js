/*
 * Small, dependency-free SVG chart kit.
 * Every chart is a pure function (options) -> SVG string, drawn at the container's real
 * width so text never stretches. `mount` redraws on resize. Colours come from CSS
 * custom properties so each project can theme the same primitives.
 */

const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** "Nice" axis ticks covering [min, max]. */
export function ticks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) { const pad = Math.abs(min) || 1; min -= pad; max += pad; }
  const span = max - min;
  const step0 = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
  const start = Math.floor(min / step) * step;
  const out = [];
  for (let k = 0; k < 100; k++) {
    const v = Number((start + k * step).toPrecision(12));
    out.push(v);
    if (v >= max - 1e-12) break;
  }
  return out;
}

const scale = (d0, d1, r0, r1) => (v) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0));

function frame(width, height, body, label) {
  return `<svg xmlns="${NS}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(label || 'Chart')}">${body}</svg>`;
}

/**
 * Line chart with optional shaded bands (e.g. Monte Carlo percentile fans) and reference lines.
 * opts: { width, height, labels[], series:[{values,label,cls,dash}], bands:[{lo[],hi[],cls}],
 *         refs:[{y,label,cls}], yFormat, label, yMin }
 */
export function lineChart(opts) {
  const { width, height = 300, labels, series = [], bands = [], refs = [], yFormat = String, label } = opts;
  const m = { t: 16, r: 18, b: 30, l: 62 };
  const all = [
    ...series.flatMap((s) => s.values),
    ...bands.flatMap((b) => [...b.lo, ...b.hi]),
    ...refs.map((r) => r.y),
  ].filter(Number.isFinite);
  const lo = opts.yMin ?? Math.min(0, ...all);
  const tk = ticks(lo, Math.max(...all), 5);
  const y = scale(tk[0], tk.at(-1), height - m.b, m.t);
  const x = scale(0, labels.length - 1, m.l, width - m.r);
  const path = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const every = Math.ceil(labels.length / Math.max(2, Math.floor((width - m.l) / 64)));
  let g = '';
  g += tk.map((t) => `<line class="grid" x1="${m.l}" x2="${width - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${esc(yFormat(t))}</text>`).join('');
  g += labels.map((l, i) => (i % every === 0 || i === labels.length - 1) ? `<text class="tick" x="${x(i)}" y="${height - 8}" text-anchor="middle">${esc(l)}</text>` : '').join('');
  for (const b of bands) {
    const top = b.hi.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const bottom = b.lo.map((_, j) => { const i = b.lo.length - 1 - j; return `L${x(i).toFixed(1)},${y(b.lo[i]).toFixed(1)}`; }).join('');
    g += `<path class="band ${b.cls || ''}" d="${top}${bottom}Z"/>`;
  }
  for (const r of refs) {
    g += `<line class="ref ${r.cls || ''}" x1="${m.l}" x2="${width - m.r}" y1="${y(r.y)}" y2="${y(r.y)}"/>`;
    if (r.label) g += `<text class="ref-label ${r.cls || ''}" x="${m.l + 6}" y="${y(r.y) - 6}">${esc(r.label)}</text>`;
  }
  for (const s of series) g += `<path class="line ${s.cls || ''}" ${s.dash ? 'stroke-dasharray="5 4"' : ''} d="${path(s.values)}"/>`;
  g += `<g class="hover" opacity="0"><line class="hover-line" y1="${m.t}" y2="${height - m.b}"/></g>`;
  g += `<rect class="hit" x="${m.l}" y="${m.t}" width="${width - m.l - m.r}" height="${height - m.t - m.b}" fill="transparent"/>`;
  return { svg: frame(width, height, g, label), xAt: (px) => Math.round(((px - m.l) / (width - m.l - m.r)) * (labels.length - 1)), xPos: x };
}

/**
 * Bar chart. Horizontal by default (labels on the left) because finance labels are long.
 * items: [{label, value, cls, note}]; supports negatives with a zero axis.
 */
export function barChart({ width, items, format = String, label, rowHeight = 30, labelWidth }) {
  const lw = labelWidth ?? Math.min(220, Math.max(90, width * 0.34));
  const vw = Math.max(60, width - lw - 70);
  const vals = items.map((i) => i.value);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const padL = lo < 0 ? 64 : 0; // room for value labels on negative bars
  const x = scale(lo, hi === lo ? lo + 1 : hi, lw + padL, lw + vw);
  const height = items.length * rowHeight + 8;
  let g = `<line class="axis" x1="${x(0)}" x2="${x(0)}" y1="0" y2="${height}"/>`;
  items.forEach((it, i) => {
    const yy = i * rowHeight + 6, bh = rowHeight - 12;
    const x0 = Math.min(x(0), x(it.value)), w = Math.max(1, Math.abs(x(it.value) - x(0)));
    g += `<text class="bar-label" x="${lw - 10}" y="${yy + bh / 2 + 4}" text-anchor="end">${esc(it.label)}</text>`;
    g += `<rect class="bar ${it.cls || (it.value < 0 ? 'neg' : 'pos')}" x="${x0}" y="${yy}" width="${w}" height="${bh}" rx="2"><title>${esc(it.label)}: ${esc(format(it.value))}</title></rect>`;
    const right = it.value >= 0;
    g += `<text class="bar-value" x="${right ? x0 + w + 6 : x0 - 6}" y="${yy + bh / 2 + 4}" text-anchor="${right ? 'start' : 'end'}">${esc(format(it.value))}</text>`;
  });
  return frame(width, height, g, label);
}

/**
 * Scatter / bubble chart with optional reference lines (e.g. covenant thresholds).
 * points: [{x, y, r, cls, label, id}]
 */
export function scatterChart({ width, height = 340, points, segments = [], xLabel, yLabel, xFormat = String, yFormat = String, refX = [], refY = [], label, xDomain, yDomain }) {
  const m = { t: 18, r: 22, b: 44, l: 58 };
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const xt = ticks(...(xDomain || [Math.min(...xs, ...refX.map((r) => r.v)), Math.max(...xs, ...refX.map((r) => r.v))]), 6);
  const yt = ticks(...(yDomain || [Math.min(...ys, ...refY.map((r) => r.v)), Math.max(...ys, ...refY.map((r) => r.v))]), 5);
  const x = scale(xt[0], xt.at(-1), m.l, width - m.r), y = scale(yt[0], yt.at(-1), height - m.b, m.t);
  let g = '';
  g += yt.map((t) => `<line class="grid" x1="${m.l}" x2="${width - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${esc(yFormat(t))}</text>`).join('');
  g += xt.map((t) => `<text class="tick" x="${x(t)}" y="${height - m.b + 18}" text-anchor="middle">${esc(xFormat(t))}</text>`).join('');
  for (const r of refX) g += `<line class="ref ${r.cls || ''}" x1="${x(r.v)}" x2="${x(r.v)}" y1="${m.t}" y2="${height - m.b}"/><text class="ref-label ${r.cls || ''}" x="${x(r.v) + (r.side === 'left' ? -5 : 5)}" y="${m.t + 12}" text-anchor="${r.side === 'left' ? 'end' : 'start'}">${esc(r.label || '')}</text>`;
  for (const r of refY) g += `<line class="ref ${r.cls || ''}" x1="${m.l}" x2="${width - m.r}" y1="${y(r.v)}" y2="${y(r.v)}"/><text class="ref-label ${r.cls || ''}" x="${width - m.r - 4}" y="${y(r.v) - 6}" text-anchor="end">${esc(r.label || '')}</text>`;
  if (xLabel) g += `<text class="axis-label" x="${(m.l + width - m.r) / 2}" y="${height - 6}" text-anchor="middle">${esc(xLabel)}</text>`;
  if (yLabel) g += `<text class="axis-label" transform="translate(14 ${(m.t + height - m.b) / 2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text>`;
  const clampX = (v) => Math.max(m.l, Math.min(width - m.r, x(v))), clampY = (v) => Math.max(m.t, Math.min(height - m.b, y(v)));
  for (const s of segments) g += `<line class="seg ${s.cls || ''}" x1="${clampX(s.x1).toFixed(1)}" y1="${clampY(s.y1).toFixed(1)}" x2="${clampX(s.x2).toFixed(1)}" y2="${clampY(s.y2).toFixed(1)}"/>`;
  const sorted = [...points].sort((a, b) => (b.r || 5) - (a.r || 5));
  for (const p of sorted) {
    const cx = Math.max(m.l, Math.min(width - m.r, x(p.x))), cy = Math.max(m.t, Math.min(height - m.b, y(p.y)));
    const left = cx > width * 0.78, off = (p.r || 5) + 4;
    const tag = p.tag ? `<text x="${left ? cx - off : cx + off}" y="${cy + 4 + (p.tagDy || 0)}" text-anchor="${left ? 'end' : 'start'}">${esc(p.tag)}</text>` : '';
    g += `<g class="pt ${p.cls || ''}" ${p.id ? `data-id="${esc(p.id)}"` : ''} tabindex="${p.id ? 0 : -1}"><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${p.r || 5}"/>${tag}<title>${esc(p.label || '')}</title></g>`;
  }
  return frame(width, height, g, label);
}

/**
 * Waterfall: [{label, value, total:boolean}] — totals are drawn from zero, deltas float.
 */
export function waterfallChart({ width, height = 280, items, format = String, label }) {
  const m = { t: 22, r: 12, b: 42, l: 12 };
  let run = 0;
  const bars = items.map((it) => {
    if (it.total) { run = it.value; return { ...it, a: 0, b: it.value }; }
    const a = run; run += it.value; return { ...it, a, b: run };
  });
  const lo = Math.min(0, ...bars.flatMap((b) => [b.a, b.b])), hi = Math.max(...bars.flatMap((b) => [b.a, b.b]));
  const y = scale(lo, hi, height - m.b, m.t);
  const slot = (width - m.l - m.r) / bars.length, bw = Math.min(64, slot * 0.62);
  let g = `<line class="axis" x1="${m.l}" x2="${width - m.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  bars.forEach((b, i) => {
    const cx = m.l + slot * i + slot / 2, top = y(Math.max(b.a, b.b)), h = Math.max(1, Math.abs(y(b.a) - y(b.b)));
    const cls = b.total ? 'total' : b.value < 0 ? 'neg' : 'pos';
    g += `<rect class="wf ${cls}" x="${cx - bw / 2}" y="${top}" width="${bw}" height="${h}" rx="2"><title>${esc(b.label)}: ${esc(format(b.value))}</title></rect>`;
    g += `<text class="bar-value" x="${cx}" y="${top - 6}" text-anchor="middle">${esc(format(b.value))}</text>`;
    g += `<text class="tick" x="${cx}" y="${height - m.b + 18}" text-anchor="middle">${esc(b.label)}</text>`;
    if (i < bars.length - 1) g += `<line class="connector" x1="${cx + bw / 2}" x2="${cx + slot - bw / 2}" y1="${y(b.b)}" y2="${y(b.b)}"/>`;
  });
  return frame(width, height, g, label);
}

/**
 * Range chart ("football field"): rows of low–high bars with a mid tick and a shared marker.
 * rows: [{label, lo, hi, mid, cls, note}], markers: [{value, label, cls}]
 */
export function rangeChart({ width, rows, markers = [], format = String, label, rowHeight = 46 }) {
  // Narrow screens: labels sit above each bar instead of in a left column.
  const compact = width < 560;
  if (compact) rowHeight = Math.max(rowHeight, 62);
  const lw = compact ? 44 : Math.min(230, Math.max(110, width * 0.3));
  const m = { t: 26, r: 26, b: 30 };
  const height = m.t + rows.length * rowHeight + m.b;
  const vals = [...rows.flatMap((r) => [r.lo, r.hi]), ...markers.map((k) => k.value)].filter(Number.isFinite);
  const tk = ticks(Math.min(...vals) * 0.95, Math.max(...vals) * 1.03, 6);
  const x = scale(tk[0], tk.at(-1), lw, width - m.r);
  let g = tk.map((t) => `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${m.t - 6}" y2="${height - m.b}"/><text class="tick" x="${x(t)}" y="${height - 10}" text-anchor="middle">${esc(format(t))}</text>`).join('');
  rows.forEach((r, i) => {
    const yy = m.t + i * rowHeight, bh = compact ? 16 : rowHeight * 0.46, cy = compact ? yy + rowHeight - 18 : yy + rowHeight / 2;
    if (compact) {
      g += `<text class="bar-label" x="4" y="${yy + 14}">${esc(r.label)}${r.note ? `<tspan class="bar-note" dx="6">${esc(r.note)}</tspan>` : ''}</text>`;
    } else {
      g += `<text class="bar-label" x="${lw - 14}" y="${cy - 2}" text-anchor="end">${esc(r.label)}</text>`;
      if (r.note) g += `<text class="bar-note" x="${lw - 14}" y="${cy + 13}" text-anchor="end">${esc(r.note)}</text>`;
    }
    g += `<rect class="range ${r.cls || ''}" x="${x(r.lo)}" y="${cy - bh / 2}" width="${Math.max(2, x(r.hi) - x(r.lo))}" height="${bh}" rx="2"><title>${esc(r.label)}: ${esc(format(r.lo))} – ${esc(format(r.hi))}</title></rect>`;
    if (Number.isFinite(r.mid)) g += `<line class="range-mid" x1="${x(r.mid)}" x2="${x(r.mid)}" y1="${cy - bh / 2 - 3}" y2="${cy + bh / 2 + 3}"/>`;
    g += `<text class="range-end" x="${x(r.lo) - 5}" y="${cy + 4}" text-anchor="end">${esc(format(r.lo))}</text>`;
    g += `<text class="range-end" x="${x(r.hi) + 5}" y="${cy + 4}">${esc(format(r.hi))}</text>`;
  });
  for (const k of markers) {
    g += `<line class="marker ${k.cls || ''}" x1="${x(k.value)}" x2="${x(k.value)}" y1="${m.t - 10}" y2="${height - m.b}"/>`;
    g += `<text class="marker-label ${k.cls || ''}" x="${x(k.value)}" y="${m.t - 14}" text-anchor="middle">${esc(k.label)}</text>`;
  }
  return frame(width, height, g, label);
}

/** Donut: slices [{label, value, cls}] */
export function donutChart({ size = 180, slices, center = '', sub = '', label }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1, r = size / 2 - 6, ir = r * 0.62, c = size / 2;
  let a = -Math.PI / 2, g = '';
  for (const s of slices) {
    const sweep = (s.value / total) * Math.PI * 2;
    if (sweep <= 0) continue;
    const a2 = a + Math.min(sweep, Math.PI * 2 - 1e-4), large = sweep > Math.PI ? 1 : 0;
    const p = (ang, rad) => `${(c + rad * Math.cos(ang)).toFixed(2)},${(c + rad * Math.sin(ang)).toFixed(2)}`;
    g += `<path class="slice ${s.cls || ''}" d="M${p(a, r)}A${r},${r} 0 ${large} 1 ${p(a2, r)}L${p(a2, ir)}A${ir},${ir} 0 ${large} 0 ${p(a, ir)}Z"><title>${esc(s.label)}</title></path>`;
    a = a2;
  }
  g += `<text class="donut-center" x="${c}" y="${c + 2}" text-anchor="middle">${esc(center)}</text><text class="donut-sub" x="${c}" y="${c + 20}" text-anchor="middle">${esc(sub)}</text>`;
  return frame(size, size, g, label);
}

/**
 * Draw into a container at its live width and keep it in sync on resize.
 * draw(width) must return an SVG string or {svg, ...}. Returns a redraw function.
 */
const observed = new WeakMap();
export function mount(el, draw) {
  const render = () => {
    const w = Math.max(260, Math.floor(el.clientWidth));
    const out = draw(w);
    el.innerHTML = typeof out === 'string' ? out : out.svg;
    if (out && out.after) out.after(el);
  };
  observed.set(el, render);
  if (!el.dataset.observed && typeof ResizeObserver !== 'undefined') {
    el.dataset.observed = '1';
    let last = el.clientWidth;
    new ResizeObserver(() => { if (Math.abs(el.clientWidth - last) > 4) { last = el.clientWidth; observed.get(el)?.(); } }).observe(el);
  }
  render();
  return render;
}

/**
 * Hover read-out for lineChart: shows a vertical guide and calls describe(i) for the tooltip text.
 */
export function lineHover(el, chart, describe) {
  const svg = el.querySelector('svg'), hit = svg?.querySelector('.hit'), hover = svg?.querySelector('.hover');
  if (!hit) return;
  let tip = el.querySelector('.chart-tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; tip.hidden = true; el.append(tip); }
  const move = (evt) => {
    const box = svg.getBoundingClientRect();
    const px = (evt.clientX - box.left) * (svg.viewBox.baseVal.width / box.width);
    const i = Math.max(0, Math.min(chart.count - 1, chart.xAt(px)));
    const gx = chart.xPos(i);
    hover.setAttribute('opacity', '1');
    hover.querySelector('line').setAttribute('x1', gx);
    hover.querySelector('line').setAttribute('x2', gx);
    tip.hidden = false;
    tip.innerHTML = describe(i);
    const left = (gx / svg.viewBox.baseVal.width) * box.width;
    tip.style.left = `${Math.min(box.width - tip.offsetWidth - 4, Math.max(4, left + 12))}px`;
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerleave', () => { hover.setAttribute('opacity', '0'); tip.hidden = true; });
}
