import { mountPlayer } from '../remotion/bundle.js';
import { reducedMotion } from './util.js';

/* "Cara kerja" slides: the illustration of each step is a scene of a Remotion
   composition (remotion/src/compositions/flows); this file keeps the step
   buttons and the explanatory text in sync with the player. */
const CSA_STEPS = [
  { t: 'Inisialisasi', s: 'P antibodi acak',
    d: 'Setiap <b>antibodi</b> = satu jadwal. Gen ke-i = VM tempat task i dijalankan.',
    p: ['P = 30 antibodi'] },
  { t: 'Afinitas', s: 'makespan + energi',
    d: 'Jadwal di-decode → makespan <i>T</i> &amp; energi <i>E</i>. Semakin kecil <i>F</i>, semakin tinggi afinitas (batang hijau).',
    f: 'F = w·T/T<sub>ref</sub> + (1−w)·E/E<sub>ref</sub>   ·   afinitas = 1/(1+F)',
    p: ['w = 0.5', 'ref = Round Robin'] },
  { t: 'Seleksi', s: 'K parent terbaik',
    d: 'Urutkan berdasarkan F. Ambil <b>K</b> teratas sebagai parent: rank 1, 2, …',
    p: ['K = 10'] },
  { t: 'Kloning', s: '⌊βP/r⌋ klon',
    d: 'Parent rank <i>r</i> menghasilkan klon <b>sebanyak βP/r</b>: rank 1 paling banyak.',
    f: 'C<sub>r</sub> = ⌊β · P / r⌋',
    p: ['β = 1.0'] },
  { t: 'Hipermutasi', s: 'mutasi ∝ rank',
    d: 'Klon dari parent <b>kuat</b> bermutasi sedikit (exploit), klon parent <b>lemah</b> bermutasi banyak (explore).',
    f: 'p<sub>r</sub> = p<sub>min</sub> + (p<sub>max</sub> − p<sub>min</sub>)·(r−1)/(K−1)',
    p: ['p_min = 1/N', 'p_max = 5/N'] },
  { t: 'Survivor + arsip', s: 'P terbaik bertahan',
    d: 'Parent ∪ klon diurutkan, <b>P terbaik</b> lanjut ke generasi berikut. Solusi non-dominated (T, E) disimpan di <b>arsip Pareto</b>.',
    p: ['G = 200 generasi'] }
];

const PHS_STEPS = [
  { t: 'Dual HM', s: 'jadwal + resource',
    d: 'Dua <b>Harmony Memory</b>: satu menyimpan jadwal (task → VM, urutan), satu menyimpan kapasitas VM. Entri 0 = <b>HEFT</b>.',
    p: ['HMS = 10 per memori'] },
  { t: 'Probe', s: 'acak · salin · crossbreed',
    d: 'Frasa baru dibangkitkan dengan salah satu dari 3 cara. <b>Crossbreed dua titik</b>: ujung dari frasa acak, tengah dari memori.' },
  { t: 'Ritme', s: 'jadwal ⟷ resource',
    d: 'Hanya <b>satu</b> jenis improvisasi per iterasi: iterasi ganjil → ritme <b>jadwal</b>, genap → ritme <b>resource</b>.' },
  { t: 'Improvisasi', s: 'k kali pada ritme aktif',
    d: 'Ritme jadwal: <b>reassign</b> task ke VM lain atau <b>swap</b> urutan. Ritme resource: <b>deactivate</b>, <b>activate</b>, atau <b>reduce</b> (1 → 0.5).',
    p: ['k = 3 improvisasi'] },
  { t: 'Repair', s: 'VM mati → VM aktif',
    d: 'Task yang jatuh ke VM <b>nonaktif</b> dipindah ke VM aktif dengan waktu selesai tercepat, sebelum dievaluasi.' },
  { t: 'Update HM', s: 'ganti yang terburuk',
    d: 'Jika makespan probe &lt; entri <b>terburuk</b> di memori ritme aktif, probe menggantikannya. Ulangi hingga iterasi habis.',
    f: 'if makespan(probe) < max(HM) → HM[worst] ← probe',
    p: ['I = 200 iterasi'] }
];

function mountFlow(prefix, steps) {
  const flow = document.getElementById(`flow-${prefix}`);
  const visual = document.getElementById(`flow-${prefix}-visual`);
  const text = document.getElementById(`flow-${prefix}-text`);
  flow.innerHTML = steps.map((s, i) => `<button class="flow-step" data-i="${i}"><span class="n">0${i + 1}</span><b>${s.t}</b><small>${s.s}</small></button>`).join('');
  visual.innerHTML = '<div class="card-title"><span data-ref="title"></span><span class="muted small" data-ref="count"></span></div><div class="flow-player"></div>';
  const title = visual.querySelector('[data-ref="title"]');
  const count = visual.querySelector('[data-ref="count"]');
  let cur = -1;
  const sync = i => {
    if (i === cur) return;
    cur = i;
    const s = steps[i];
    flow.querySelectorAll('.flow-step').forEach((b, k) => (k === i ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')));
    title.textContent = `Ilustrasi · ${s.t}`;
    count.textContent = `${i + 1}/${steps.length}`;
    text.innerHTML = `<div class="card-title">Langkah ${i + 1}</div><p class="flow-desc">${s.d}</p>${s.f ? `<div class="formula">${s.f}</div>` : ''}${s.p ? `<div class="params">${s.p.map(x => `<span class="chip ${prefix}">${x}</span>`).join('')}</div>` : ''}`;
  };
  const player = mountPlayer(visual.querySelector('.flow-player'), `${prefix}-flow`, {}, { loop: true }).on('step', sync);
  flow.addEventListener('click', e => {
    const b = e.target.closest('.flow-step');
    if (b) player.seekStep(+b.dataset.i, { animate: !reducedMotion() });
  });
  sync(0);
  return {
    enter() {
      if (reducedMotion()) { player.seekStep(0, { animate: false }); return; }
      player.seekTo(0);
      player.play();
    },
    leave() { player.pause(); }
  };
}

export const mountCsaFlow = () => mountFlow('csa', CSA_STEPS);
export const mountPhsFlow = () => mountFlow('phs', PHS_STEPS);
