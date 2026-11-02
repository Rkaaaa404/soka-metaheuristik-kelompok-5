import { Mulberry32 } from '../algorithms/rng.js';
import { vmColor } from './util.js';

/* Mini illustrations: rows of genes (task → VM colour). Deliberately small
   and deterministic; the real algorithms run in the Lab slide. */
const T = 10, M = 4;
const rnd = seed => { const r = new Mulberry32(seed); return Array.from({ length: T }, () => r.nextInt(M)); };
const genes = (row, { mut = [], off = [], cut = null, from = null } = {}) => row.map((v, i) =>
  `<td><div class="gene ${mut.includes(i) ? 'mut' : ''} ${off.includes(v) ? 'off' : ''}" style="--gc:${vmColor(v)};${from && from[i] ? 'box-shadow:inset 0 -3px 0 var(--fg)' : ''}">${v}</div></td>${cut && cut.includes(i + 1) ? '<td class="cutcol"></td>' : ''}`).join('');
const table = (rows, head = true) => `<table class="gene-table mini">
  ${head ? `<tr><th class="lbl"></th>${Array.from({ length: T }, (_, i) => `<th>t${i}</th>`).join('')}<th></th></tr>` : ''}
  ${rows.map((r, k) => `<tr class="gene-row ${r.cls || ''}" style="animation-delay:${k * 90}ms"><td class="lbl">${r.label}</td>${genes(r.g, r)}<td class="val">${r.val ?? ''}</td></tr>`).join('')}
</table>`;
const caps = (c, cls = '') => `<div class="cap-row ${cls}">${c.map((v, i) => `<div class="cap-cell" style="--gc:${vmColor(i)}"><i style="height:${v * 100}%"></i><em>${v * 100}</em></div>`).join('')}</div>`;
const legend = `<div class="vm-legend">${Array.from({ length: M }, (_, i) => `<span style="--gc:${vmColor(i)}"><i></i>VM ${i}</span>`).join('')}</div>`;

const P = [rnd(1), rnd(2), rnd(3), rnd(4)];
const F = [0.91, 0.78, 1.06, 0.84];

const CSA_STEPS = [
  { t: 'Inisialisasi', s: 'P antibodi acak',
    d: 'Setiap <b>antibodi</b> = satu jadwal. Gen ke-i = VM tempat task i dijalankan.',
    p: ['P = 30 antibodi'],
    v: () => table(P.map((g, i) => ({ label: `Ab${i}`, g, cls: 'enter' }))) + legend },
  { t: 'Afinitas', s: 'makespan + energi',
    d: 'Jadwal di-decode → makespan <i>T</i> &amp; energi <i>E</i>. Semakin kecil <i>F</i>, semakin tinggi afinitas.',
    f: 'F = w·T/T<sub>ref</sub> + (1−w)·E/E<sub>ref</sub>   ·   afinitas = 1/(1+F)',
    p: ['w = 0.5', 'ref = Round Robin'],
    v: () => table(P.map((g, i) => ({ label: `Ab${i}`, g, val: `F=${F[i]}` }))) },
  { t: 'Seleksi', s: 'K parent terbaik',
    d: 'Urutkan berdasarkan F. Ambil <b>K</b> teratas sebagai parent: rank 1, 2, …',
    p: ['K = 10'],
    v: () => table([1, 3, 0, 2].map((i, r) => ({ label: r < 2 ? `#${r + 1} Ab${i}` : `Ab${i}`, g: P[i], val: `F=${F[i]}`, cls: r < 2 ? 'sel enter' : 'out enter' }))) },
  { t: 'Kloning', s: '⌊βP/r⌋ klon',
    d: 'Parent rank <i>r</i> menghasilkan klon <b>sebanyak βP/r</b>: rank 1 paling banyak.',
    f: 'C<sub>r</sub> = ⌊β · P / r⌋',
    p: ['β = 1.0'],
    v: () => table([
      { label: '#1 Ab1', g: P[1], cls: 'sel' }, { label: '  klon', g: P[1], cls: 'clone enter' }, { label: '  klon', g: P[1], cls: 'clone enter' }, { label: '  klon', g: P[1], cls: 'clone enter' },
      { label: '#2 Ab3', g: P[3], cls: 'sel' }, { label: '  klon', g: P[3], cls: 'clone enter' }]) },
  { t: 'Hipermutasi', s: 'mutasi ∝ rank',
    d: 'Klon dari parent <b>kuat</b> bermutasi sedikit (exploit), klon parent <b>lemah</b> bermutasi banyak (explore).',
    f: 'p<sub>r</sub> = p<sub>min</sub> + (p<sub>max</sub> − p<sub>min</sub>)·(r−1)/(K−1)',
    p: ['p_min = 1/N', 'p_max = 5/N'],
    v: () => {
      const a = [...P[1]]; a[4] = (a[4] + 1) % M;
      const b = [...P[3]]; [1, 5, 8].forEach(i => { b[i] = (b[i] + 2) % M; });
      return table([{ label: 'rank 1', g: a, mut: [4], cls: 'clone' }, { label: 'rank 2', g: b, mut: [1, 5, 8], cls: 'clone' }]);
    } },
  { t: 'Survivor + arsip', s: 'P terbaik bertahan',
    d: 'Parent ∪ klon diurutkan, <b>P terbaik</b> lanjut ke generasi berikut. Solusi non-dominated (T, E) disimpan di <b>arsip Pareto</b>.',
    p: ['G = 200 generasi'],
    v: () => table([
      { label: 'klon', g: (() => { const a = [...P[1]]; a[4] = (a[4] + 1) % M; return a; })(), val: 'F=0.71', cls: 'sel' },
      { label: 'Ab1', g: P[1], val: 'F=0.78', cls: 'sel' }, { label: 'Ab3', g: P[3], val: 'F=0.84', cls: 'sel' },
      { label: 'klon', g: P[3].map((v, i) => [1, 5, 8].includes(i) ? (v + 2) % M : v), val: 'F=1.12', cls: 'out' }]) }
];

const HM = [rnd(11), rnd(12), rnd(13)];
const RM = [[1, 1, 1, 1], [1, .5, 0, 1], [0, 1, .5, 1]];

const PHS_STEPS = [
  { t: 'Dual HM', s: 'jadwal + resource',
    d: 'Dua <b>Harmony Memory</b>: satu menyimpan jadwal (task → VM, urutan), satu menyimpan kapasitas VM. Entri 0 = <b>HEFT</b>.',
    p: ['HMS = 10 per memori'],
    v: () => `<div class="hm-mini">${table(HM.map((g, i) => ({ label: i ? `HM${i}` : 'HEFT', g, cls: 'enter' })))}
      <div><div class="tiny-h">Resource HM</div>${RM.map(c => caps(c)).join('')}</div></div>` },
  { t: 'Probe', s: 'acak · salin · crossbreed',
    d: 'Frasa baru dibangkitkan dengan salah satu dari 3 cara. <b>Crossbreed dua titik</b>: ujung dari frasa acak, tengah dari memori.',
    v: () => {
      const a = rnd(21), b = HM[1];
      const c = a.map((v, i) => (i >= 3 && i < 7 ? b[i] : v));
      return table([{ label: 'acak', g: a }, { label: 'HM1', g: b }, { label: 'probe', g: c, cut: [3, 7], from: c.map((_, i) => i >= 3 && i < 7), cls: 'enter' }]);
    } },
  { t: 'Ritme', s: 'jadwal ⟷ resource',
    d: 'Hanya <b>satu</b> jenis improvisasi per iterasi: iterasi ganjil → ritme <b>jadwal</b>, genap → ritme <b>resource</b>.',
    v: () => `<div class="rhythm-strip">${Array.from({ length: 8 }, (_, i) => `<span class="${i % 2 ? 'r' : 's'}" style="animation-delay:${i * 0.25}s">${i + 1}<small>${i % 2 ? 'resource' : 'jadwal'}</small></span>`).join('')}</div>` },
  { t: 'Improvisasi', s: 'k kali pada ritme aktif',
    d: 'Ritme jadwal: <b>reassign</b> task ke VM lain atau <b>swap</b> urutan. Ritme resource: <b>deactivate</b>, <b>activate</b>, atau <b>reduce</b> (1 → 0.5).',
    p: ['k = 3 improvisasi'],
    v: () => {
      const a = HM[1], b = [...a]; b[2] = (b[2] + 1) % M; [b[6], b[8]] = [b[8], b[6]];
      return table([{ label: 'sebelum', g: a }, { label: 'sesudah', g: b, mut: [2, 6, 8] }]) +
        `<div class="cap-pair"><div><div class="tiny-h">deactivate VM 1</div>${caps([1, 1, 1, 1])}${caps([1, 0, 1, 1], 'enter')}</div><div><div class="tiny-h">reduce VM 3</div>${caps([1, 1, 1, 1])}${caps([1, 1, 1, .5], 'enter')}</div></div>`;
    } },
  { t: 'Repair', s: 'VM mati → VM aktif',
    d: 'Task yang jatuh ke VM <b>nonaktif</b> dipindah ke VM aktif dengan waktu selesai tercepat, sebelum dievaluasi.',
    v: () => {
      const a = HM[1], b = a.map(v => (v === 1 ? 0 : v));
      return `${caps([1, 0, 1, 1])}${table([{ label: 'probe', g: a, off: [1] }, { label: 'repair', g: b, mut: a.map((v, i) => (v === 1 ? i : -1)).filter(i => i >= 0), cls: 'enter' }])}`;
    } },
  { t: 'Update HM', s: 'ganti yang terburuk',
    d: 'Jika makespan probe &lt; entri <b>terburuk</b> di memori ritme aktif, probe menggantikannya. Ulangi hingga iterasi habis.',
    f: 'if makespan(probe) < max(HM) → HM[worst] ← probe',
    p: ['I = 200 iterasi'],
    v: () => table([{ label: 'HEFT', g: HM[0], val: '298 s' }, { label: 'HM1', g: HM[1], val: '312 s' }, { label: 'HM2 ✕', g: HM[2], val: '355 s', cls: 'out' }, { label: 'probe ✓', g: rnd(31), val: '286 s', cls: 'sel enter' }]) }
];

function mountFlow(prefix, steps) {
  const flow = document.getElementById(`flow-${prefix}`);
  const visual = document.getElementById(`flow-${prefix}-visual`);
  const text = document.getElementById(`flow-${prefix}-text`);
  flow.innerHTML = steps.map((s, i) => `<button class="flow-step" data-i="${i}"><span class="n">0${i + 1}</span><b>${s.t}</b><small>${s.s}</small></button>`).join('');
  let cur = 0, timer = null;
  const go = i => {
    cur = (i + steps.length) % steps.length;
    const s = steps[cur];
    flow.querySelectorAll('.flow-step').forEach((b, k) => (k === cur ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')));
    visual.innerHTML = `<div class="card-title">Ilustrasi · ${s.t}<span class="muted small">${cur + 1}/${steps.length}</span></div>${s.v()}`;
    text.innerHTML = `<div class="card-title">Langkah ${cur + 1}</div><p class="flow-desc">${s.d}</p>${s.f ? `<div class="formula">${s.f}</div>` : ''}${s.p ? `<div class="params">${s.p.map(x => `<span class="chip ${prefix}">${x}</span>`).join('')}</div>` : ''}`;
  };
  flow.addEventListener('click', e => { const b = e.target.closest('.flow-step'); if (b) { stop(); go(+b.dataset.i); } });
  const stop = () => { clearInterval(timer); timer = null; };
  go(0);
  return {
    enter() { go(0); stop(); timer = setInterval(() => go(cur + 1), 5200); },
    leave: stop
  };
}

export const mountCsaFlow = () => mountFlow('csa', CSA_STEPS);
export const mountPhsFlow = () => mountFlow('phs', PHS_STEPS);
