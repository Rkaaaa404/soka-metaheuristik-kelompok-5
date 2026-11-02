import { Story } from './story.js';
import { problemStats } from '../remotion/bundle.js';

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
/* Slides 2/3/4/6: Remotion compositions (remotion/src/compositions/   */
/* stories) driven by the Story controller.                             */
/* ------------------------------------------------------------------ */
export function mountProblem(root) {
  const { random: R, smart: S } = problemStats;
  return new Story(root, {
    composition: 'problem',
    steps: [
      { label: 'Antrean task', caption: '10 task dengan panjang berbeda (<b>MI</b>) menunggu dijalankan di 3 VM dengan kecepatan berbeda (<b>MIPS</b>).' },
      { label: 'Penempatan asal', caption: `Asal tempel → VM Small kebanjiran. Task terakhir selesai pada <b>${Math.round(R)} s</b>.` },
      { label: 'Penempatan cerdas', caption: `Task yang sama, VM yang sama, peta berbeda → <b>${Math.round(S)} s</b> (${Math.round((1 - S / R) * 100)}% lebih cepat). Inilah yang dicari algoritma.` }
    ]
  });
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

export function mountLandscape(root) {
  const cards = document.querySelectorAll('.ee-card');
  const modes = ['explore', 'exploit', 'balance'];
  return new Story(root, {
    composition: 'landscape',
    steps: [
      { label: 'Exploration', caption: '<b>Lompat acak</b>: menemukan banyak lembah, tapi jarang tepat di dasarnya.' },
      { label: 'Exploitation', caption: '<b>Turun bukit</b> dari posisi sekarang: cepat, tapi bisa terjebak di <b>optimum lokal</b>.' },
      { label: 'Seimbang', caption: 'Sebagian besar langkah di sekitar terbaik, sesekali <b>lompat jauh</b> → menemukan lembah terdalam (<b>optimum global</b>).' }
    ],
    onStep: s => cards.forEach(c => c.classList.toggle('on', c.dataset.ee === modes[s - 1]))
  });
}

export function mountImmune(root) {
  return new Story(root, {
    composition: 'immune',
    mapping: document.getElementById('map-immune'),
    steps: [
      { label: 'Antigen', caption: 'Patogen (<b>antigen</b>) masuk. Ribuan sel B dengan reseptor berbeda siap merespons.' },
      { label: 'Afinitas', caption: 'Tiap sel diukur seberapa cocok mengikat antigen: <b>afinitas</b>. Sel paling cocok menempel.' },
      { label: 'Kloning', caption: 'Hanya sel berafinitas tinggi yang <b>dikloning</b>: makin cocok, makin banyak klonnya (4 vs 2).' },
      { label: 'Hipermutasi', caption: 'Klon bermutasi. Klon sel terbaik bermutasi <b>sedikit</b>, klon sel lemah bermutasi <b>banyak</b>.' },
      { label: 'Memori', caption: 'Klon terbaik menjadi <b>sel memori</b>, siap untuk serangan berikutnya → di CSA: <b>arsip Pareto</b>.' }
    ]
  });
}

export function mountJazz(root) {
  return new Story(root, {
    composition: 'jazz',
    mapping: document.getElementById('map-jazz'),
    steps: [
      { label: 'Memori', caption: 'Setiap musisi mengingat frasa terbaik. PHS menyimpan <b>dua</b> memori: <b>jadwal</b> &amp; <b>resource VM</b>. Satu entri berasal dari HEFT.' },
      { label: 'Improvisasi', caption: 'Frasa baru (<b>probe</b>): acak, salin dari memori, atau <b>crossbreed</b> potongan memori dengan frasa acak.' },
      { label: 'Poliritme', caption: 'Seperti ritme <b>3 lawan 4</b>: satu iterasi mengubah jadwal, iterasi berikutnya mengubah resource, bergantian.' },
      { label: 'Nilai', caption: 'Probe didengar (dihitung makespan). Jika lebih baik dari frasa <b>terburuk</b>, probe menggantikannya.' },
      { label: 'Harmoni', caption: 'Hasil akhir = gabungan terbaik: <b>jadwal task</b> + <b>konfigurasi VM</b>.' }
    ]
  });
}
