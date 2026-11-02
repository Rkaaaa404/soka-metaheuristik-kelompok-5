import { Story } from './story.js';
import { Mulberry32 } from '../algorithms/rng.js';
import { fmt } from './util.js';

/* ------------------------------------------------------------------ */
/* Cover art: tasks flowing into three VMs (SMIL, loops forever)       */
/* ------------------------------------------------------------------ */
export function mountCover(root) {
  const colors = ['var(--vm-small)', 'var(--vm-medium)', 'var(--vm-large)'];
  const lanes = [70, 150, 230];
  let tokens = '';
  for (let i = 0; i < 12; i++) {
    const lane = lanes[i % 3];
    const delay = (i * 0.45).toFixed(2);
    tokens += `<rect width="22" height="14" rx="3" fill="${colors[i % 3]}" opacity=".9">
      <animateMotion dur="5.4s" begin="${delay}s" repeatCount="indefinite"
        path="M10,150 C120,150 140,${lane} 300,${lane} L330,${lane}" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".4 0 .2 1"/>
      <animate attributeName="opacity" dur="5.4s" begin="${delay}s" repeatCount="indefinite" values="0;1;1;0" keyTimes="0;.1;.85;1"/>
    </rect>`;
  }
  root.innerHTML = `<svg viewBox="0 0 480 300">
    <defs><pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="var(--border-strong)"/></pattern></defs>
    <rect width="480" height="300" rx="20" fill="url(#dots)" opacity=".7"/>
    ${lanes.map((y, i) => `<path d="M10,150 C120,150 140,${y} 300,${y}" fill="none" stroke="var(--border-strong)" stroke-dasharray="3 5"/>
      <g transform="translate(340 ${y - 28})">
        <rect width="120" height="56" rx="10" fill="var(--surface)" stroke="var(--border-strong)"/>
        <rect x="10" y="10" width="8" height="36" rx="3" fill="${colors[i]}"/>
        <text x="28" y="26" font-family="var(--font-mono)" font-size="12" font-weight="700" fill="var(--fg)">VM ${['Small', 'Medium', 'Large'][i]}</text>
        <text x="28" y="42" font-family="var(--font-mono)" font-size="10" fill="var(--fg-muted)">${[500, 1000, 2000][i]} MIPS</text>
      </g>`).join('')}
    <g transform="translate(10 120)"><rect width="60" height="60" rx="12" fill="var(--fg)"/>
      <text x="30" y="35" text-anchor="middle" font-family="var(--font-mono)" font-size="11" font-weight="700" fill="var(--surface)">GoCJ</text></g>
    ${tokens}
  </svg>`;
}

/* ------------------------------------------------------------------ */
/* Slide 2: queue → random mapping → smart mapping (Gantt per VM)       */
/* ------------------------------------------------------------------ */
const P_TASKS = [83, 95, 91, 30, 15, 62, 48, 120, 40, 70].map((k, i) => ({ id: i, mi: k * 1000 }));
const P_VMS = [{ name: 'Small', mips: 500 }, { name: 'Medium', mips: 1000 }, { name: 'Large', mips: 2000 }];
const RANDOM_MAP = [0, 0, 1, 0, 2, 0, 1, 0, 2, 1];

function lpt() {
  const free = P_VMS.map(() => 0);
  const map = [];
  [...P_TASKS].sort((a, b) => b.mi - a.mi).forEach(t => {
    let best = 0, bestEnd = Infinity;
    P_VMS.forEach((v, j) => { const end = free[j] + t.mi / v.mips; if (end < bestEnd) { bestEnd = end; best = j; } });
    map[t.id] = best; free[best] = bestEnd;
  });
  return map;
}
const SMART_MAP = lpt();

function layout(map) {
  const free = P_VMS.map(() => 0);
  const pos = [];
  P_TASKS.forEach(t => {
    const v = map[t.id];
    const dur = t.mi / P_VMS[v].mips;
    pos[t.id] = { v, start: free[v], dur };
    free[v] += dur;
  });
  return { pos, makespan: Math.max(...free) };
}

export function mountProblem(root) {
  const R = layout(RANDOM_MAP), S = layout(SMART_MAP);
  const X0 = 150, W = 470, scale = W / R.makespan;
  const laneY = v => 78 + v * 80;
  let tasksEl;
  const place = step => {
    const L = step === 3 ? S : R;
    tasksEl.querySelectorAll('g[data-t]').forEach(g => {
      const id = +g.dataset.t;
      const rect = g.querySelector('rect');
      const label = g.querySelector('text');
      if (step === 1) {
        g.style.transform = `translate(${X0 + id * 47}px, 26px)`;
        rect.style.width = '42px';
        label.setAttribute('x', 21);
      } else {
        const p = L.pos[id];
        g.style.transform = `translate(${X0 + p.start * scale}px, ${laneY(p.v) + 14}px)`;
        rect.style.width = `${Math.max(14, p.dur * scale - 2)}px`;
        label.setAttribute('x', Math.max(14, p.dur * scale - 2) / 2);
      }
    });
    const mk = root.querySelector('.mk');
    const m = step === 3 ? S.makespan : R.makespan;
    mk.style.transform = `translateX(${X0 + m * scale}px)`;
    mk.querySelector('text').textContent = `makespan ${Math.round(m)} s`;
    mk.style.opacity = step === 1 ? 0 : 1;
  };
  const story = new Story(root, {
    steps: [
      { label: 'Antrean task', caption: '10 task dengan panjang berbeda (<b>MI</b>) menunggu dijalankan di 3 VM dengan kecepatan berbeda (<b>MIPS</b>).' },
      { label: 'Penempatan asal', caption: `Asal tempel → VM Small kebanjiran. Task terakhir selesai pada <b>${Math.round(R.makespan)} s</b>.` },
      { label: 'Penempatan cerdas', caption: `Task yang sama, VM yang sama, peta berbeda → <b>${Math.round(S.makespan)} s</b> (${Math.round((1 - S.makespan / R.makespan) * 100)}% lebih cepat). Inilah yang dicari algoritma.` }
    ],
    init(stage) {
      stage.innerHTML = `<svg class="anim problem-svg" viewBox="0 0 640 330">
        <text x="${X0 - 10}" y="42" text-anchor="end" class="lbl">Antrean</text>
        ${P_VMS.map((v, i) => `<g transform="translate(${X0 - 6} ${laneY(i)})">
          <rect x="0" y="6" width="${W + 12}" height="44" rx="8" fill="var(--surface-alt)"/>
          <text x="-4" y="26" text-anchor="end" class="lbl">VM ${v.name}</text>
          <text x="-4" y="40" text-anchor="end" class="sub">${v.mips} MIPS</text></g>`).join('')}
        <g class="tasks">${P_TASKS.map(t => `<g data-t="${t.id}">
          <rect height="22" rx="4" fill="var(--c${t.id % 8})"/>
          <text y="15" text-anchor="middle" class="tok">T${t.id}</text></g>`).join('')}</g>
        <g class="mk"><line y1="70" y2="330" stroke="var(--error)" stroke-width="2" stroke-dasharray="5 4"/>
          <text y="64" text-anchor="end" class="mk-lbl">makespan</text></g>
      </svg>`;
      tasksEl = stage.querySelector('.tasks');
    },
    onStep: place
  });
  return story;
}

export function mountSpaceCounter() {
  const n = document.getElementById('space-n');
  const m = document.getElementById('space-m');
  const update = () => {
    const N = +n.value, M = +m.value;
    document.getElementById('space-n-out').textContent = N.toLocaleString('id-ID');
    document.getElementById('space-m-out').textContent = M;
    const exp = N * Math.log10(M);
    const out = document.getElementById('space-number');
    if (exp < 6) out.textContent = Math.round(M ** N).toLocaleString('id-ID');
    else out.innerHTML = `10<sup>${Math.floor(exp)}</sup>`;
    const years = exp - 9 - Math.log10(3.15e7);
    document.getElementById('space-time').textContent = years < 0 ? '< 1 tahun' : years < 4 ? `${Math.round(10 ** years)} tahun` : `10^${Math.floor(years)} th`;
    document.getElementById('space-sub').textContent = `kemungkinan jadwal untuk ${N.toLocaleString('id-ID')} task × ${M} VM`;
  };
  n.addEventListener('input', update);
  m.addEventListener('input', update);
  update();
}

/* ------------------------------------------------------------------ */
/* Slide 3: fitness landscape — explore vs exploit                      */
/* ------------------------------------------------------------------ */
const f = x => 70
  - 38 * Math.exp(-((x - 0.18) ** 2) / 0.004)
  - 52 * Math.exp(-((x - 0.72) ** 2) / 0.002)
  - 30 * Math.exp(-((x - 0.45) ** 2) / 0.006)
  + 8 * Math.sin(x * 22);

export function mountLandscape(root) {
  const W = 640, H = 260, top = 20, bottom = 230;
  const ys = Array.from({ length: 201 }, (_, i) => f(i / 200));
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const Y = v => bottom - (v - lo) / (hi - lo) * (bottom - top);
  const X = x => 20 + x * (W - 40);
  const curve = ys.map((v, i) => `${i ? 'L' : 'M'}${X(i / 200).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const rng = new Mulberry32(7);
  let agents = [], best = null, mode = 'explore', timer = null, svg;

  const reset = () => {
    agents = Array.from({ length: 7 }, (_, i) => ({ x: 0.05 + i * 0.14 }));
    best = null;
  };
  const tick = () => {
    for (const a of agents) {
      if (mode === 'explore') a.x = rng.nextDouble();
      else if (mode === 'exploit') {
        const c = Math.min(1, Math.max(0, a.x + (rng.nextDouble() - .5) * 0.04));
        if (f(c) < f(a.x)) a.x = c;
      } else {
        const r = rng.nextDouble();
        const base = r < 0.25 ? rng.nextDouble() : (best ? best.x : a.x) + (rng.nextDouble() - .5) * 0.08;
        const c = Math.min(1, Math.max(0, base));
        if (r < 0.25 || f(c) < f(a.x)) a.x = c;
      }
      if (!best || f(a.x) < f(best.x)) best = { x: a.x };
    }
    draw();
  };
  const draw = () => {
    svg.querySelectorAll('.agent').forEach((c, i) => {
      c.style.transform = `translate(${X(agents[i].x)}px, ${Y(f(agents[i].x)) - 7}px)`;
    });
    const b = svg.querySelector('.best');
    if (best) { b.style.opacity = 1; b.style.transform = `translate(${X(best.x)}px, ${Y(f(best.x)) - 26}px)`; }
    else b.style.opacity = 0;
    svg.querySelector('.best-lbl').textContent = best ? `terbaik: ${fmt(f(best.x), 1)}` : '';
  };

  const cards = document.querySelectorAll('.ee-card');
  const story = new Story(root, {
    interval: 6000,
    steps: [
      { label: 'Exploration', caption: '<b>Lompat acak</b>: menemukan banyak lembah, tapi jarang tepat di dasarnya.' },
      { label: 'Exploitation', caption: '<b>Turun bukit</b> dari posisi sekarang: cepat, tapi bisa terjebak di <b>optimum lokal</b>.' },
      { label: 'Seimbang', caption: 'Sebagian besar langkah di sekitar terbaik, sesekali <b>lompat jauh</b> → menemukan lembah terdalam (<b>optimum global</b>).' }
    ],
    init(stage) {
      stage.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="anim landscape-svg">
        <defs><linearGradient id="lg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--primary-soft)" stop-opacity=".2"/><stop offset="1" stop-color="var(--primary-soft)"/></linearGradient></defs>
        <path d="${curve} L${X(1)},${H} L${X(0)},${H} Z" fill="url(#lg)"/>
        <path d="${curve}" fill="none" stroke="var(--fg)" stroke-width="2"/>
        <text x="${X(0.72)}" y="${H - 6}" text-anchor="middle" class="lbl">optimum global</text>
        <text x="${X(0.18)}" y="${H - 6}" text-anchor="middle" class="sub">optimum lokal</text>
        <text x="16" y="14" class="sub">↑ makespan (lebih rendah = lebih baik)</text>
        ${Array.from({ length: 7 }, () => '<circle class="agent" r="7"/>').join('')}
        <path class="best" d="M0,-9 L2.6,-3 9,-3 4,1 6,8 0,4 -6,8 -4,1 -9,-3 -2.6,-3Z" fill="var(--accent)"/>
        <text class="best-lbl lbl" x="${W - 20}" y="14" text-anchor="end"></text>
      </svg>`;
      svg = stage.querySelector('svg');
    },
    onStep(s) {
      mode = ['explore', 'exploit', 'balance'][s - 1];
      reset();
      draw();
      cards.forEach(c => c.classList.toggle('on', c.dataset.ee === mode));
    }
  });
  const origEnter = story.enter.bind(story), origLeave = story.leave.bind(story);
  story.enter = () => { origEnter(); timer = setInterval(tick, 420); };
  story.leave = () => { origLeave(); clearInterval(timer); };
  return story;
}

/* ------------------------------------------------------------------ */
/* Slide 4: immune clonal selection                                     */
/* ------------------------------------------------------------------ */
const cell = (x, y, color, cls, vars = '') =>
  `<g class="${cls}" style="--x:${x}px;--y:${y}px;${vars}">
     <circle r="19" fill="${color}" stroke="var(--fg)" stroke-width="1.5"/>
     <path d="M0,-19 L0,-28 M0,-28 L-6,-34 M0,-28 L6,-34" stroke="var(--fg)" stroke-width="2.4" fill="none" stroke-linecap="round"/>
   </g>`;

export function mountImmune(root) {
  const cells = [
    { x: 80, y: 60, c: '#9fc6d9', a: .35 }, { x: 80, y: 150, c: '#a9d4b5', a: .7 }, { x: 80, y: 240, c: '#d9c49f', a: .2 },
    { x: 175, y: 85, c: '#7fbfae', a: .92, best: true }, { x: 175, y: 215, c: '#c9a9d4', a: .45 }
  ];
  const clones = [
    ...[0, 1, 2, 3].map(i => ({ x: 430 + i * 50, y: 70, from: cells[3], c: '#7fbfae', r: 1, mut: i === 1 ? '#5fae9a' : null, mem: i === 1 })),
    ...[0, 1].map(i => ({ x: 430 + i * 50, y: 180, from: cells[1], c: '#a9d4b5', r: 2, mut: i === 0 ? '#e0b86b' : '#d98b7a' }))
  ];
  return new Story(root, {
    mapping: document.getElementById('map-immune'),
    steps: [
      { label: 'Antigen', caption: 'Patogen (<b>antigen</b>) masuk. Ribuan sel B dengan reseptor berbeda siap merespons.' },
      { label: 'Afinitas', caption: 'Tiap sel diukur seberapa cocok mengikat antigen: <b>afinitas</b>. Sel paling cocok menempel.' },
      { label: 'Kloning', caption: 'Hanya sel berafinitas tinggi yang <b>dikloning</b>: makin cocok, makin banyak klonnya (4 vs 2).' },
      { label: 'Hipermutasi', caption: 'Klon bermutasi. Klon sel terbaik bermutasi <b>sedikit</b>, klon sel lemah bermutasi <b>banyak</b>.' },
      { label: 'Memori', caption: 'Klon terbaik menjadi <b>sel memori</b>, siap untuk serangan berikutnya → di CSA: <b>arsip Pareto</b>.' }
    ],
    init(stage) {
      stage.innerHTML = `<svg viewBox="0 0 640 300" class="anim immune">
        <g class="antigen" transform="translate(300 150)">
          <polygon points="${Array.from({ length: 16 }, (_, i) => { const r = i % 2 ? 18 : 32; const a = i * Math.PI / 8; return `${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`; }).join(' ')}" fill="var(--error)" opacity=".85"/>
          <text y="50" text-anchor="middle" class="lbl">antigen</text>
        </g>
        ${cells.map((c, i) => `${cell(c.x, c.y, c.c, `bcell ${c.best ? 'best' : ''} ${i === 1 ? 'second' : ''}`)}
          <g class="aff ${c.best ? 'best-aff' : ''}" transform="translate(${c.x - 24} ${c.y + 26})"><rect width="48" height="5" rx="2" fill="var(--surface-alt)"/><rect width="${48 * c.a}" height="5" rx="2" fill="var(--primary)"/></g>`).join('')}
        <text x="430" y="36" class="lbl fade-in3">rank 1 → 4 klon</text>
        <text x="430" y="146" class="lbl fade-in3">rank 2 → 2 klon</text>
        ${clones.map(k => cell(k.x, k.y, k.c, `clone r${k.r} ${k.mut ? 'mutates' : ''} ${k.mem ? 'mem' : ''}`,
          `--fx:${k.from.x - k.x}px;--fy:${k.from.y - k.y}px;--mut:${k.mut || k.c}`)).join('')}
        <text x="430" y="118" class="sub fade-in4">mutasi kecil</text>
        <text x="430" y="228" class="sub fade-in4">mutasi besar</text>
        <g class="memory" transform="translate(560 262)">
          <circle r="22" fill="none" stroke="var(--accent)" stroke-width="3" stroke-dasharray="4 3"/>
          <text x="-30" y="5" text-anchor="end" class="lbl">sel memori</text>
        </g>
      </svg>`;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Slide 6: jazz polyrhythm                                             */
/* ------------------------------------------------------------------ */
export function mountJazz(root) {
  const melody = (seed, n = 8) => {
    const r = new Mulberry32(seed);
    return Array.from({ length: n }, () => r.nextInt(4));
  };
  const sheet = (x, y, notes, label, cls = '') => `<g class="sheet ${cls}" transform="translate(${x} ${y})">
      <rect width="150" height="34" rx="6" fill="var(--surface)" stroke="var(--border-strong)"/>
      ${notes.map((v, i) => `<rect x="${8 + i * 13}" y="9" width="11" height="16" rx="2" fill="var(--c${v})"/>`).join('')}
      <text x="${8 + notes.length * 13 + 4}" y="22" class="sub">${label}</text></g>`;
  const caps = (x, y, c, label, cls = '') => `<g class="sheet ${cls}" transform="translate(${x} ${y})">
      <rect width="150" height="34" rx="6" fill="var(--surface)" stroke="var(--border-strong)"/>
      ${c.map((v, i) => `<rect x="${8 + i * 18}" y="${27 - v * 18}" width="14" height="${Math.max(2, v * 18)}" rx="2" fill="var(--c${i})"/>`).join('')}
      <text x="${8 + c.length * 18 + 2}" y="22" class="sub">${label}</text></g>`;
  const beats = (y, n, cls) => Array.from({ length: n }, (_, i) =>
    `<circle class="beat ${cls}" cx="${170 + (i + 0.5) * (300 / n)}" cy="${y}" r="9" style="animation-delay:${(i * 2.4 / n).toFixed(2)}s"/>`).join('');
  return new Story(root, {
    mapping: document.getElementById('map-jazz'),
    steps: [
      { label: 'Memori', caption: 'Setiap musisi mengingat frasa terbaik. PHS menyimpan <b>dua</b> memori: <b>jadwal</b> &amp; <b>resource VM</b>. Satu entri berasal dari HEFT.' },
      { label: 'Improvisasi', caption: 'Frasa baru (<b>probe</b>): acak, salin dari memori, atau <b>crossbreed</b> potongan memori dengan frasa acak.' },
      { label: 'Poliritme', caption: 'Seperti ritme <b>3 lawan 4</b>: satu iterasi mengubah jadwal, iterasi berikutnya mengubah resource, bergantian.' },
      { label: 'Nilai', caption: 'Probe didengar (dihitung makespan). Jika lebih baik dari frasa <b>terburuk</b>, probe menggantikannya.' },
      { label: 'Harmoni', caption: 'Hasil akhir = gabungan terbaik: <b>jadwal task</b> + <b>konfigurasi VM</b>.' }
    ],
    init(stage) {
      stage.innerHTML = `<svg viewBox="0 0 640 300" class="anim jazz">
        <text x="20" y="22" class="lbl">HM · Jadwal</text>
        <text x="470" y="22" class="lbl">HM · Resource</text>
        ${sheet(20, 34, melody(1), '312 s', 'hs0')}${sheet(20, 74, melody(2), '298 s', 'hs1')}${sheet(20, 114, melody(3), '355 s', 'hs2 worst')}
        ${caps(470, 34, [1, .5, 1, 0, 1], '', 'hr0')}${caps(470, 74, [1, 1, .5, .5, 0], '', 'hr1')}${caps(470, 114, [0, 1, 1, .5, 1], '', 'hr2')}
        <g class="musician" transform="translate(320 88)">
          <circle r="34" fill="var(--phs-soft)" stroke="var(--phs)" stroke-width="2"/>
          <text y="12" text-anchor="middle" font-size="32">🎷</text>
        </g>
        <g class="probe">${sheet(245, 136, [0, 3, 3, 1, 2, 2, 1, 0], 'probe', '')}</g>
        <path class="cut" d="M290,130 V176 M342,130 V176" stroke="var(--phs)" stroke-width="2" stroke-dasharray="3 3"/>
        <g class="verdict"><text x="320" y="196" text-anchor="middle" class="lbl ok">286 s &lt; 355 s → ganti terburuk ✓</text></g>
        <g class="rhythm">
          <text x="160" y="232" text-anchor="end" class="sub">ritme jadwal · 4</text>
          <text x="160" y="272" text-anchor="end" class="sub">ritme resource · 3</text>
          <line x1="170" x2="470" y1="232" y2="232" stroke="var(--border)"/>
          <line x1="170" x2="470" y1="272" y2="272" stroke="var(--border)"/>
          ${beats(232, 4, 'b4')}${beats(272, 3, 'b3')}
        </g>
        <g class="final" transform="translate(470 196)">
          <rect width="150" height="64" rx="10" fill="var(--phs)"/>
          <text x="75" y="28" text-anchor="middle" class="lbl inv">🎼 harmoni terbaik</text>
          <text x="75" y="46" text-anchor="middle" class="sub inv">jadwal + VM aktif</text>
        </g>
      </svg>`;
    }
  });
}
