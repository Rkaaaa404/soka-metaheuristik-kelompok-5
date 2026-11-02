export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** VM identity colour (lab: max 8 VMs) */
export const vmColor = i => `var(--c${i % 8})`;

export const fmt = (n, d = 2) => {
  if (!Number.isFinite(n)) return '–';
  if (Math.abs(n) >= 10000) return n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
  if (n !== 0 && Math.abs(n) < 0.01) return n.toExponential(1);
  return n.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
};

/** Tiny SVG line chart. points: [{x, y}] */
export function lineChart({ points, width = 280, height = 140, xMax, yMin, yMax, xLabel = '', yLabel = '' }) {
  const pad = { l: 38, r: 8, t: 8, b: 20 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const xs = Math.max(1, xMax ?? Math.max(...points.map(p => p.x), 1));
  const lo = yMin ?? Math.min(...points.map(p => p.y));
  const hi = yMax ?? Math.max(...points.map(p => p.y));
  const span = hi - lo || 1;
  const X = x => pad.l + (x / xs) * w;
  const Y = y => pad.t + h - ((y - lo) / span) * h;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const last = points[points.length - 1];
  return `<svg class="mini-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(yLabel)} terhadap ${esc(xLabel)}">
    <line class="grid" x1="${pad.l}" x2="${pad.l + w}" y1="${pad.t}" y2="${pad.t}"/>
    <line class="grid" x1="${pad.l}" x2="${pad.l + w}" y1="${pad.t + h / 2}" y2="${pad.t + h / 2}"/>
    <line class="axis" x1="${pad.l}" x2="${pad.l + w}" y1="${pad.t + h}" y2="${pad.t + h}"/>
    <line class="axis" x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${pad.t + h}"/>
    <text x="${pad.l - 4}" y="${pad.t + 8}" text-anchor="end">${fmt(hi, 0)}</text>
    <text x="${pad.l - 4}" y="${pad.t + h}" text-anchor="end">${fmt(lo, 0)}</text>
    <text x="${pad.l + w}" y="${height - 4}" text-anchor="end">${esc(xLabel)} ${xs}</text>
    <text x="${pad.l}" y="${height - 4}">0</text>
    ${points.length ? `<path class="line" d="${path}"/><circle class="pt" r="3.5" cx="${X(last.x)}" cy="${Y(last.y)}"/>` : ''}
  </svg>`;
}

/** Scatter (e.g. Pareto front). groups: [{cls, points:[{x,y}]}] */
export function scatter({ groups, width = 280, height = 150, xLabel = '', yLabel = '' }) {
  const pad = { l: 38, r: 8, t: 8, b: 22 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const all = groups.flatMap(g => g.points);
  if (!all.length) return '';
  const xlo = Math.min(...all.map(p => p.x)), xhi = Math.max(...all.map(p => p.x));
  const ylo = Math.min(...all.map(p => p.y)), yhi = Math.max(...all.map(p => p.y));
  const X = x => pad.l + ((x - xlo) / (xhi - xlo || 1)) * w;
  const Y = y => pad.t + h - ((y - ylo) / (yhi - ylo || 1)) * h;
  return `<svg class="mini-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(yLabel)} vs ${esc(xLabel)}">
    <line class="axis" x1="${pad.l}" x2="${pad.l + w}" y1="${pad.t + h}" y2="${pad.t + h}"/>
    <line class="axis" x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${pad.t + h}"/>
    <text x="${pad.l + w}" y="${height - 6}" text-anchor="end">${esc(xLabel)} →</text>
    <text x="${pad.l - 4}" y="${pad.t + 8}" text-anchor="end">${esc(yLabel)}</text>
    ${groups.map(g => g.points.map(p => `<circle class="${g.cls}" r="${g.r || 3.5}" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}"/>`).join('')).join('')}
  </svg>`;
}
