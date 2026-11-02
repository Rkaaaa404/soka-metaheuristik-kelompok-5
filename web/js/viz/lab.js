import { csaStepGenerator } from '../algorithms/csa.js';
import { phsStepGenerator } from '../algorithms/phs.js';
import { decodeSchedule } from '../algorithms/decoder.js';
import { Api } from '../api.js';
import { mountPlayer } from '../remotion/bundle.js';
import { esc, fmt, vmColor, lineChart, scatter, reducedMotion } from './util.js';

const VM_TYPES = {
  S: { type: 'Small', nominalMips: 500, pes: 1 },
  M: { type: 'Medium', nominalMips: 1000, pes: 2 },
  L: { type: 'Large', nominalMips: 2000, pes: 4 }
};
const VM_PATTERN = ['S', 'M', 'L', 'S', 'M', 'S', 'M', 'L'];
const TOTAL_HOSTS = 2;

const PSEUDO = {
  CSA: [
    'P ← bangkitkan P antibodi acak',
    'hitung afinitas F(T, E); isi arsip Pareto',
    'for g ← 1 … G:',
    '  parent ← K antibodi dengan F terkecil',
    '  klon parent rank r sebanyak ⌊βP/r⌋',
    '  hipermutasi: laju p_r naik sesuai rank',
    '  evaluasi klon; perbarui arsip Pareto',
    '  P ← P terbaik dari (P ∪ klon)',
    'return solusi F terkecil dari arsip'
  ],
  PHS: [
    'HM_jadwal, HM_resource ← HEFT + acak',
    'for i ← 1 … I:',
    '  ritme ← jadwal (ganjil) / resource (genap)',
    '  probe ← acak | salin HM | crossbreed',
    '  improvisasi probe k× pada ritme aktif',
    '  repair: task di VM mati → VM aktif',
    '  if probe < terburuk(HM ritme): ganti',
    'return harmoni dengan makespan terkecil'
  ]
};
const PHASE_LINES = {
  CSA: { INIT: [0, 1], SELECTION: [2, 3], CLONING: [4], MUTATION: [5, 6], SURVIVOR: [7], FINISHED: [8] },
  PHS: { INIT: [0], HARMONY_GENERATION: [1, 2, 3], IMPROVISATION_AND_REPAIR: [4, 5], MEMORY_UPDATE: [6], FINISHED: [7] }
};
const PHASE_LABEL = {
  INIT: 'Inisialisasi', SELECTION: 'Seleksi', CLONING: 'Kloning', MUTATION: 'Hipermutasi', SURVIVOR: 'Survivor', FINISHED: 'Selesai',
  HARMONY_GENERATION: 'Probe', IMPROVISATION_AND_REPAIR: 'Improvisasi + repair', MEMORY_UPDATE: 'Update HM'
};

const PARAMS = [
  { key: 'n', label: 'Task (N)', min: 4, max: 40, step: 1 },
  { key: 'vms', label: 'VM (M)', min: 2, max: 8, step: 1 },
  { key: 'seed', label: 'Seed', min: 0, max: 99999, step: 1 },
  { key: 'csa.population', label: 'CSA · populasi P', min: 3, max: 12, step: 1, algo: 'CSA' },
  { key: 'csa.selected', label: 'CSA · parent K', min: 1, max: 6, step: 1, algo: 'CSA' },
  { key: 'csa.generations', label: 'CSA · generasi G', min: 2, max: 40, step: 1, algo: 'CSA' },
  { key: 'csa.beta', label: 'CSA · β', min: 0.2, max: 2, step: 0.1, algo: 'CSA' },
  { key: 'csa.timeWeight', label: 'CSA · bobot waktu w', min: 0, max: 1, step: 0.05, algo: 'CSA' },
  { key: 'phs.memorySize', label: 'PHS · HMS', min: 2, max: 8, step: 1, algo: 'PHS' },
  { key: 'phs.iterations', label: 'PHS · iterasi I', min: 2, max: 60, step: 1, algo: 'PHS' },
  { key: 'phs.improvisations', label: 'PHS · improvisasi k', min: 1, max: 6, step: 1, algo: 'PHS' }
];
const getP = (o, k) => k.split('.').reduce((a, p) => a[p], o);
const setP = (o, k, v) => { const ks = k.split('.'); const last = ks.pop(); ks.reduce((a, p) => a[p], o)[last] = v; };

export class Lab {
  constructor(root) {
    this.root = root;
    this.algo = 'CSA';
    this.stage = 'process';
    this.params = {
      n: 16, vms: 5, seed: 7,
      csa: { population: 6, selected: 3, generations: 12, beta: 1.0, timeWeight: 0.5 },
      phs: { memorySize: 4, iterations: 20, improvisations: 3 }
    };
    this.allTasks = [];
    this.frames = [];
    this.idx = 0;
    this.speed = 1;
    this.player = null;
    this.build();
  }

  /* ---------------------------------------------------------------- */
  build() {
    this.root.innerHTML = `
      <div class="lab-top">
        <div class="seg csa-phs" role="group" aria-label="Algoritma">
          <button data-algo="CSA" aria-pressed="true">CSA · Clonal Selection</button>
          <button data-algo="PHS" aria-pressed="false">PHS · Polyrhythmic HS</button>
        </div>
        <div class="seg stage-tabs" role="group" aria-label="Tahap">
          <button data-stage="problem" aria-pressed="false">Masalah</button>
          <button data-stage="process" aria-pressed="true">Proses</button>
          <button data-stage="solution" aria-pressed="false">Solusi</button>
        </div>
        <button class="btn" data-act="fullscreen" title="Layar penuh">⛶ Layar penuh</button>
      </div>
      <details class="card lab-params-wrap">
        <summary>⚙ Parameter: <span data-ref="param-summary"></span></summary>
        <div class="lab-params">${PARAMS.map(p => `<label class="field" data-algo-only="${p.algo || ''}">${p.label} <output data-out="${p.key}"></output>
          <input type="range" data-param="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}"></label>`).join('')}</div>
        <p class="note" style="margin-top:.5rem">Task = <b>N task pertama</b> dataset GoCJ asli. VM: pola Small/Medium/Large. Setiap perubahan menjalankan ulang algoritma secara live.</p>
      </details>

      <div class="lab-stage" data-stage-panel="problem" hidden></div>

      <div class="lab-stage" data-stage-panel="process">
        <div class="player" role="group" aria-label="Kontrol pemutaran">
          <button class="btn btn-icon" data-act="first" aria-label="Ke awal">⏮</button>
          <button class="btn btn-icon" data-act="back" aria-label="Langkah mundur">◀</button>
          <button class="btn btn-primary btn-icon" data-act="play" aria-label="Putar">▶</button>
          <button class="btn btn-icon" data-act="fwd" aria-label="Langkah maju">▶|</button>
          <button class="btn btn-icon" data-act="last" aria-label="Ke akhir">⏭</button>
          <input type="range" data-ref="scrub" min="0" value="0" aria-label="Geser timeline">
          <select data-ref="speed" aria-label="Kecepatan"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select>
          <span class="frame-count" data-ref="count"></span>
        </div>
        <div class="lab-body" style="margin-top:1rem">
          <div class="lab-main">
            <div class="card">
              <div class="phase-strip" data-ref="phases"></div>
              <p class="status-line" data-ref="status" aria-live="polite" style="margin-top:.5rem"></p>
            </div>
            <div class="card lab-video"><div data-ref="video"></div>
              <p class="note" style="margin-top:.5rem">Kiri: populasi/memori (baris = jadwal, kotak = VM tiap task). Kanan: jadwal yang disorot dijalankan sebagai Gantt; garis merah = makespan.</p>
            </div>
          </div>
          <aside class="lab-side">
            <div class="card"><div class="card-title">Pseudocode</div><ol class="pseudo" data-ref="pseudo"></ol></div>
            <div class="card"><div class="card-title">Konvergensi · makespan terbaik</div><div data-ref="conv"></div></div>
            <div class="card"><div class="card-title" data-ref="extra-title"></div><div data-ref="extra"></div></div>
          </aside>
        </div>
      </div>

      <div class="lab-stage" data-stage-panel="solution" hidden></div>`;
    const $ = s => this.root.querySelector(`[data-ref="${s}"]`);
    this.el = Object.fromEntries(['param-summary', 'scrub', 'speed', 'count', 'phases', 'status', 'video', 'pseudo', 'conv', 'extra', 'extra-title'].map(k => [k, $(k)]));

    this.root.querySelectorAll('[data-algo]').forEach(b => b.addEventListener('click', () => this.setAlgo(b.dataset.algo)));
    this.root.querySelectorAll('[data-stage]').forEach(b => b.addEventListener('click', () => this.setStage(b.dataset.stage)));
    this.root.querySelector('[data-act="fullscreen"]').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else this.root.requestFullscreen?.().catch(() => {});
    });
    const act = (name, fn) => this.root.querySelector(`[data-act="${name}"]`).addEventListener('click', fn);
    act('first', () => { this.pause(); this.show(0); });
    act('back', () => { this.pause(); this.show(this.idx - 1); });
    act('fwd', () => { this.pause(); this.show(this.idx + 1); });
    act('last', () => { this.pause(); this.show(this.frames.length - 1); });
    act('play', () => (this.player?.isPlaying() ? this.pause() : this.play()));
    this.el.scrub.addEventListener('input', e => { this.pause(); this.show(+e.target.value, { animate: false }); });
    this.el.speed.addEventListener('change', e => { this.speed = +e.target.value; this.player?.setRate(this.speed); });

    let debounce;
    this.root.querySelectorAll('[data-param]').forEach(inp => {
      inp.value = getP(this.params, inp.dataset.param);
      inp.addEventListener('input', () => {
        setP(this.params, inp.dataset.param, +inp.value);
        if (this.params.csa.selected > this.params.csa.population) this.params.csa.selected = this.params.csa.population;
        this.syncParams();
        clearTimeout(debounce);
        debounce = setTimeout(() => this.recompute(), 220);
      });
    });
    this.syncParams();

    // Keyboard: , / . step, space play — only while the lab slide is visible
    document.addEventListener('keydown', e => {
      if (!this.root.closest('.slide')?.classList.contains('active') || this.stage !== 'process') return;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (e.key === '.') { this.pause(); this.show(this.idx + 1); }
      else if (e.key === ',') { this.pause(); this.show(this.idx - 1); }
      else if (e.key === ' ') { e.preventDefault(); this.player?.isPlaying() ? this.pause() : this.play(); }
    });
  }

  syncParams() {
    this.root.querySelectorAll('[data-param]').forEach(inp => {
      const v = getP(this.params, inp.dataset.param);
      inp.value = v;
      this.root.querySelector(`[data-out="${inp.dataset.param}"]`).textContent = v;
    });
    this.root.querySelectorAll('[data-algo-only]').forEach(l => {
      l.hidden = !!l.dataset.algoOnly && l.dataset.algoOnly !== this.algo;
    });
    const p = this.params;
    this.el['param-summary'].textContent = this.algo === 'CSA'
      ? `${p.n} task · ${p.vms} VM · P=${p.csa.population} K=${p.csa.selected} G=${p.csa.generations} β=${p.csa.beta} w=${p.csa.timeWeight} · seed ${p.seed}`
      : `${p.n} task · ${p.vms} VM · HMS=${p.phs.memorySize} I=${p.phs.iterations} k=${p.phs.improvisations} · seed ${p.seed}`;
  }

  async load() {
    if (this.allTasks.length) return;
    this.el.status.textContent = 'Memuat task GoCJ…';
    try {
      const resp = await Api.fetchDatasetTasks('GoCJ_Dataset_1000.csv', 40);
      this.allTasks = resp.tasks;
      this.recompute();
    } catch (e) {
      this.el.status.textContent = `Dataset tidak dapat dimuat: ${e.message}`;
    }
  }

  setAlgo(a) {
    if (a === this.algo) return;
    this.algo = a;
    this.root.dataset.algo = a;
    this.root.querySelectorAll('[data-algo]').forEach(b => b.setAttribute('aria-pressed', b.dataset.algo === a));
    this.syncParams();
    this.recompute();
  }

  setStage(s) {
    this.stage = s;
    this.pause();
    this.root.querySelectorAll('[data-stage]').forEach(b => b.setAttribute('aria-pressed', b.dataset.stage === s));
    this.root.querySelectorAll('[data-stage-panel]').forEach(p => { p.hidden = p.dataset.stagePanel !== s; });
    if (s === 'problem') this.renderProblem();
    if (s === 'solution') this.renderSolution();
    if (s === 'process') this.show(this.idx, { animate: false });
  }

  /* ---------------------------------------------------------------- */
  scenario() {
    const p = this.params;
    const tasks = this.allTasks.slice(0, p.n).map((t, i) => ({ id: i, datasetId: t.id, lengthMi: t.lengthMi, sla: t.sla, arrivalTime: t.arrivalTime }));
    const vms = Array.from({ length: p.vms }, (_, i) => ({ id: i, ...VM_TYPES[VM_PATTERN[i]] }));
    return { tasks, vms };
  }

  runAlgo(algo, tasks, vms) {
    const p = this.params;
    const gen = algo === 'CSA'
      ? csaStepGenerator(tasks, vms, p.csa, p.seed, TOTAL_HOSTS)
      : phsStepGenerator(tasks, vms, p.phs, p.seed, TOTAL_HOSTS);
    return [...gen];
  }

  recompute() {
    if (!this.allTasks.length) return;
    this.pause();
    const { tasks, vms } = this.scenario();
    this.tasks = tasks;
    this.vms = vms;
    this.frames = this.runAlgo(this.algo, tasks, vms);
    this.el.scrub.max = this.frames.length - 1;
    const props = { frames: this.frames, tasks, vms, totalHosts: TOTAL_HOSTS };
    const comp = this.algo === 'CSA' ? 'csa-run' : 'phs-run';
    if (!this.player) {
      this.player = mountPlayer(this.el.video, comp, props)
        .on('step', i => this.sync(i))
        .on('play', () => this.setPlayBtn(true))
        .on('pause', () => this.setPlayBtn(false))
        .on('ended', () => this.setPlayBtn(false));
      this.player.setRate(this.speed);
    } else {
      this.player.update(props, comp);
    }
    this.idx = -1;
    this.sync(0);
    if (this.stage === 'problem') this.renderProblem();
    if (this.stage === 'solution') this.renderSolution();
  }

  play() {
    if (!this.player || !this.frames.length) return;
    if (this.idx >= this.frames.length - 1) this.player.seekTo(0);
    this.player.play();
  }

  pause() { this.player?.pause(); }

  setPlayBtn(on) {
    const btn = this.root.querySelector('[data-act="play"]');
    btn.textContent = on ? '❚❚' : '▶';
    btn.setAttribute('aria-label', on ? 'Jeda' : 'Putar');
  }

  enter() { this.load(); }
  leave() { this.pause(); }

  /* ---------------------------------------------------------------- */
  /** Go to algorithm step i: the video plays that step's transition (or jumps when animate=false). */
  show(i, { animate = true } = {}) {
    if (!this.player || !this.frames.length) return;
    this.player.seekStep(Math.max(0, Math.min(this.frames.length - 1, i)), { animate: animate && !reducedMotion() });
  }

  /** Player reached step i (playing, stepping or scrubbing): update the HTML around the video. */
  sync(i) {
    if (i === this.idx || !this.frames.length) return;
    this.idx = i;
    const s = this.frames[i];
    this.el.scrub.value = i;
    this.el.count.textContent = `${i + 1} / ${this.frames.length}`;

    const phases = Object.keys(PHASE_LINES[this.algo]);
    this.el.phases.innerHTML = phases.map(p => `<span class="${p === s.phase ? 'on' : ''}">${PHASE_LABEL[p]}</span>`).join('');
    const iter = this.algo === 'CSA' ? `Generasi ${s.generation}/${s.maxGenerations}` : `Iterasi ${s.iteration}/${s.maxIterations}`;
    this.el.status.innerHTML = `<b>${iter}</b> · ${esc(s.message)}`;

    const on = PHASE_LINES[this.algo][s.phase] || [];
    this.el.pseudo.innerHTML = PSEUDO[this.algo].map((l, k) =>
      `<li class="${l.startsWith('  ') ? 'ind' : ''} ${on.includes(k) ? 'on' : ''}">${esc(l.trim())}</li>`).join('');

    this.renderSide(s);
  }

  /* ---------------- side panels ---------------- */
  renderSide(s) {
    const xKey = this.algo === 'CSA' ? 'generation' : 'iteration';
    const xMax = this.algo === 'CSA' ? s.maxGenerations : s.maxIterations;
    const byX = new Map();
    for (let k = 0; k <= this.idx; k++) { const f = this.frames[k]; if (f.best) byX.set(f[xKey] || 0, f.best.makespan); }
    const pts = [...byX].map(([x, y]) => ({ x, y }));
    const all = this.frames.filter(f => f.best).map(f => f.best.makespan);
    this.el.conv.innerHTML = lineChart({ points: pts, xMax, yMin: Math.min(...all) * 0.98, yMax: Math.max(...all) * 1.02, xLabel: this.algo === 'CSA' ? 'gen' : 'iter', yLabel: 'makespan' })
      + `<div class="small muted">Terbaik saat ini: <b>${fmt(s.best?.makespan, 1)} s</b> · awal ${fmt(this.frames[0].best.makespan, 1)} s</div>`;

    if (this.algo === 'CSA') {
      this.el['extra-title'].textContent = 'Arsip Pareto · makespan vs energi';
      this.el.extra.innerHTML = scatter({
        groups: [
          { cls: 'pt-faint', points: s.population.map(c => ({ x: c.makespan, y: c.energy })) },
          { cls: 'pt', points: s.archive.map(c => ({ x: c.makespan, y: c.energy })), r: 4.5 },
          { cls: 'pt-best', points: s.best ? [{ x: s.best.makespan, y: s.best.energy }] : [], r: 5.5 }
        ], xLabel: 'makespan', yLabel: 'energi'
      }) + `<div class="small muted">● arsip (${s.archive.length}) · ○ populasi · ★ terpilih (F terkecil)</div>`;
    } else {
      let acc = 0, rej = 0;
      for (let k = 0; k <= this.idx; k++) { const f = this.frames[k]; if (f.phase === 'MEMORY_UPDATE') f.accepted ? acc++ : rej++; }
      const seed = this.frames[0].candidate.makespan;
      this.el['extra-title'].textContent = 'Statistik memori';
      this.el.extra.innerHTML = `<div class="kpis">
        <div class="kpi"><b>${acc}</b><span>probe diterima</span></div>
        <div class="kpi"><b>${rej}</b><span>probe ditolak</span></div>
        <div class="kpi"><b>${fmt((1 - s.best.makespan / seed) * 100, 1)}%</b><span>lebih baik dari HEFT</span></div></div>`;
    }
  }

  /* ---------------- stage: problem ---------------- */
  renderProblem() {
    const panel = this.root.querySelector('[data-stage-panel="problem"]');
    if (!this.tasks) { panel.innerHTML = '<p class="muted">Memuat…</p>'; return; }
    const maxMi = Math.max(...this.tasks.map(t => t.lengthMi));
    const exp = this.tasks.length * Math.log10(this.vms.length);
    panel.innerHTML = `<div class="grid-2">
      <div class="card"><div class="card-title">${this.tasks.length} task GoCJ (tinggi = panjang MI)<span class="chip">tiba t=${this.tasks[0].arrivalTime}…${this.tasks[this.tasks.length - 1].arrivalTime} s</span></div>
        <div class="task-bars">${this.tasks.map(t => `<div style="height:${(t.lengthMi / maxMi * 100).toFixed(1)}%" title="t${t.id} · GoCJ #${t.datasetId} · ${t.lengthMi.toLocaleString('id-ID')} MI · tiba ${t.arrivalTime} s"></div>`).join('')}</div>
        <p class="note" style="margin-top:.5rem">Arahkan kursor ke batang untuk detail. Task non-preemptive, dijalankan sesuai urutan prioritas.</p></div>
      <div class="card"><div class="card-title">${this.vms.length} VM heterogen</div>
        <div class="vm-cards">${this.vms.map((v, i) => `<div class="vm-card" style="--gc:${vmColor(i)}"><b>VM ${i}</b>${v.type}<br>${v.nominalMips} MIPS × ${v.pes} PE</div>`).join('')}</div>
        <div class="kpis" style="margin-top:1rem">
          <div class="kpi"><b>${exp < 7 ? Math.round(this.vms.length ** this.tasks.length).toLocaleString('id-ID') : `10^${Math.floor(exp)}`}</b><span>kemungkinan peta (M<sup>N</sup>)</span></div>
          <div class="kpi"><b>min makespan</b><span>${this.algo === 'CSA' ? '+ energi (bobot w)' : '+ atur kapasitas VM'}</span></div>
        </div>
        <button class="btn btn-primary" style="margin-top:1rem" data-goto="process">Lihat prosesnya →</button></div>
    </div>`;
    panel.querySelector('[data-goto]').addEventListener('click', () => this.setStage('process'));
  }

  /* ---------------- stage: solution ---------------- */
  renderSolution() {
    const panel = this.root.querySelector('[data-stage-panel="solution"]');
    if (!this.tasks) { panel.innerHTML = '<p class="muted">Memuat…</p>'; return; }
    const { tasks, vms } = this;
    const order = [...tasks].sort((a, b) => a.arrivalTime - b.arrivalTime || a.id - b.id).map(t => t.id);
    const full = vms.map(() => 1);
    const rr = { taskOrder: order, assignedVm: order.reduce((a, t, i) => { a[t] = i % vms.length; return a; }, []), capacityFactors: full };
    const free = vms.map(v => Array(v.pes).fill(0));
    const fc = { taskOrder: order, assignedVm: [], capacityFactors: full };
    order.forEach(t => {
      let best = 0, bs = Infinity;
      vms.forEach((v, j) => { const s = Math.max(tasks[t].arrivalTime, Math.min(...free[j])); if (s < bs) { bs = s; best = j; } });
      const pe = free[best].indexOf(Math.min(...free[best]));
      free[best][pe] = bs + tasks[t].lengthMi / vms[best].nominalMips;
      fc.assignedVm[t] = best;
    });
    const csaFrames = this.algo === 'CSA' ? this.frames : this.runAlgo('CSA', tasks, vms);
    const phsFrames = this.algo === 'PHS' ? this.frames : this.runAlgo('PHS', tasks, vms);
    const plans = [
      { name: 'Round Robin', plan: rr },
      { name: 'FCFS', plan: fc },
      { name: 'HEFT (seed PHS)', plan: phsFrames[0].candidate },
      { name: 'CSA', plan: csaFrames.at(-1).best, cls: 'csa' },
      { name: 'PHS', plan: phsFrames.at(-1).best, cls: 'phs' }
    ].map(p => ({ ...p, dec: decodeSchedule(tasks, vms, p.plan, TOTAL_HOSTS) }));
    const maxMk = Math.max(...plans.map(p => p.dec.makespan));
    const mine = plans.find(p => p.name === this.algo);
    const dec = mine.dec, plan = mine.plan;
    const busy = vms.map(() => 0);
    tasks.forEach(t => { busy[plan.assignedVm[t.id]] += (dec.finishTimes[t.id] - dec.startTimes[t.id]) / vms[plan.assignedVm[t.id]].pes; });
    const mean = busy.reduce((a, b) => a + b, 0) / vms.length;
    const di = mean ? (Math.max(...busy) - Math.min(...busy)) / mean : 0;

    panel.innerHTML = `<div class="split">
      <div class="card"><div class="card-title">Timeline eksekusi · ${this.algo} terbaik<span class="chip ${this.algo.toLowerCase()}">makespan ${fmt(dec.makespan, 1)} s</span></div>
        ${this.gantt(dec, plan)}</div>
      <div class="card"><div class="card-title">Dibandingkan baseline · makespan (s) ↓</div>
        <div class="compare-bars">${plans.map(p => `<div class="cmp ${p.cls || ''}"><span>${p.name}</span><div class="cmp-track"><div class="cmp-fill" style="width:${(p.dec.makespan / maxMk * 100).toFixed(1)}%"></div></div><b>${fmt(p.dec.makespan, 1)}</b></div>`).join('')}</div>
        <div class="metric-chips" style="margin-top:1rem">
          <div class="metric-chip"><span>Makespan</span><b>${fmt(dec.makespan, 1)} s</b></div>
          <div class="metric-chip"><span>Energi (estimasi)</span><b>${fmt(dec.energyJoules / 1000, 1)} kJ</b></div>
          <div class="metric-chip"><span>Utilisasi VM</span><b>${fmt(mean / dec.makespan * 100, 1)}%</b></div>
          <div class="metric-chip"><span>Imbalance (DI)</span><b>${fmt(di, 2)}</b></div>
          <div class="metric-chip"><span>VM aktif</span><b>${plan.capacityFactors.filter(c => c > 0).length}/${vms.length}</b></div>
        </div>
        <p class="note" style="margin-top:.75rem">Skala mini di browser (decoder analitik, sama dengan backend). Uji skala penuh di CloudSim → slide berikutnya.</p>
      </div></div>`;
  }

  gantt(dec, plan) {
    const mk = dec.makespan || 1;
    const rows = this.vms.map((vm, v) => {
      const bars = this.tasks.filter(t => plan.assignedVm[t.id] === v).map(t => {
        const s = dec.startTimes[t.id], f = dec.finishTimes[t.id];
        const pe = dec.assignedPe[t.id];
        const h = 100 / vm.pes;
        return `<div class="g-bar" style="--gc:${vmColor(v)};left:${(s / mk * 100).toFixed(2)}%;width:${Math.max(0.8, (f - s) / mk * 100).toFixed(2)}%;top:${(pe * h).toFixed(1)}%;height:${h.toFixed(1)}%;bottom:auto;line-height:normal;font-size:${vm.pes > 2 ? '.5rem' : '.58rem'}" title="t${t.id} · VM ${v} PE ${pe} · ${fmt(s, 1)} → ${fmt(f, 1)} s">t${t.id}</div>`;
      }).join('');
      return `<div class="g-row"><span>VM ${v}</span><div class="g-track" style="height:${12 + vm.pes * 8}px">${bars}</div></div>`;
    }).join('');
    return `<div class="gantt">${rows}</div><div class="g-axis"><span>0 s</span><span>${fmt(mk / 2, 0)} s</span><span>${fmt(mk, 0)} s</span></div>`;
  }
}
