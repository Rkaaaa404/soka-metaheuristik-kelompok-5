import { Api } from './api.js';
import { esc, fmt } from './viz/util.js';
import { ScenarioFormManager } from './scenario-form.js';

export const ALGOS = ['CSA', 'PHS', 'FCFS', 'RR', 'SJF', 'MinMin', 'MaxMin'];
export const METRICS = [
  { key: 'makespan', label: 'Makespan', unit: 's', higher: false },
  { key: 'averageWaitingTime', label: 'Waiting time', unit: 's', higher: false },
  { key: 'averageExecutionTime', label: 'Execution time', unit: 's', higher: false },
  { key: 'averageTurnaroundTime', label: 'Turnaround', unit: 's', higher: false },
  { key: 'throughput', label: 'Throughput', unit: 'task/s', higher: true },
  { key: 'resourceUtilization', label: 'Utilisasi', unit: '%', higher: true },
  { key: 'degreeOfImbalance', label: 'Imbalance (DI)', unit: '', higher: false },
  { key: 'totalCost', label: 'Total cost', unit: 'G$', higher: false },
  { key: 'schedulingTime', label: 'Scheduling time', unit: 'ms', higher: false }
];
// Batas bawah makespan snapshot: max(arrival + MI / 2000 MIPS) per dataset GoCJ pada infrastruktur default.
const MAKESPAN_LOWER_BOUND = { 1000: 2062, 5000: 5237.5, 10000: 23173.25 };
const algoCls = a => (a === 'CSA' ? 'csa' : a === 'PHS' ? 'phs' : '');

function vmSummary(rep) {
  if (rep.vmSummary) return rep.vmSummary;
  const vms = {};
  for (const a of rep.allocations) {
    const v = vms[a.vmId] ||= { vmId: a.vmId, tasks: 0, busy: 0, lastFinish: 0 };
    v.tasks++; v.busy += a.cpuTime; v.lastFinish = Math.max(v.lastFinish, a.finish);
  }
  return Object.values(vms);
}

function infraVms(scn) {
  const d = scn.vmDistribution;
  const list = [];
  let id = 0;
  for (let dc = 0; dc < scn.datacenters; dc++)
    for (let h = 0; h < scn.hostsPerDatacenter; h++) {
      for (let i = 0; i < d.small; i++) list.push({ id: id++, dc, h, t: 'S', pes: 1 });
      for (let i = 0; i < d.medium; i++) list.push({ id: id++, dc, h, t: 'M', pes: 2 });
      for (let i = 0; i < d.large; i++) list.push({ id: id++, dc, h, t: 'L', pes: 4 });
    }
  return list;
}

const HEAT = [[241, 239, 231], [159, 211, 196], [23, 107, 96], [13, 59, 53]];
function heat(u) {
  const x = Math.max(0, Math.min(1, u)) * (HEAT.length - 1);
  const i = Math.min(HEAT.length - 2, Math.floor(x)), f = x - i;
  const c = HEAT[i].map((v, k) => Math.round(v + (HEAT[i + 1][k] - v) * f));
  return `rgb(${c.join(',')})`;
}

export class Results {
  constructor() {
    this.result = null;
    this.source = '';
    this.algo = 'PHS';
    this.metric = 'makespan';
    this.snapFile = null;
    this.running = false;
    this.form = new ScenarioFormManager();
    this.caseRoot = document.getElementById('case-study');
    this.evalRoot = document.getElementById('evaluation');
    this.caseBar = document.getElementById('case-toolbar');
    this.evalBar = document.getElementById('eval-toolbar');
  }

  async init() {
    const snaps = Api.snapshots;
    const select = () => `<label class="field" style="flex-direction:row;align-items:center;gap:.4rem">Skenario
      <select class="input" data-snap style="width:auto">${snaps.map(s => `<option value="${s.file}">GoCJ ${s.taskCount.toLocaleString('id-ID')} task · ${s.runs} run</option>`).join('')}
      ${Api.live ? '<option value="__live" disabled>Hasil run live</option>' : ''}</select></label>`;
    this.caseBar.innerHTML = select() + (Api.live ? '<button class="btn btn-primary" data-act="cfg">⚙ Jalankan CloudSim live</button>' : '');
    this.evalBar.innerHTML = select();
    document.querySelectorAll('[data-snap]').forEach(s => s.addEventListener('change', () => this.loadSnapshot(s.value)));
    this.caseBar.querySelector('[data-act="cfg"]')?.addEventListener('click', () => this.toggleForm());
    if (snaps.length) await this.loadSnapshot(snaps[0].file);
    else this.caseRoot.innerHTML = this.evalRoot.innerHTML = '<div class="alert error">Snapshot hasil CloudSim tidak ditemukan (data/results/index.json).</div>';
  }

  async loadSnapshot(file) {
    if (file === '__live') return;
    this.snapFile = file;
    document.querySelectorAll('[data-snap]').forEach(s => { s.value = file; });
    try {
      const data = await Api.fetchSnapshot(file);
      this.setResult(data, 'snapshot');
    } catch (e) {
      this.caseRoot.innerHTML = `<div class="alert error">Gagal memuat ${esc(file)}: ${esc(e.message)}</div>`;
    }
  }

  setResult(result, source) {
    this.result = result;
    this.source = source;
    if (!result.results.some(r => r.algorithm === this.algo)) this.algo = result.results[0].algorithm;
    this.renderCase();
    this.renderEval();
    this.renderTakeaways();
  }

  /* ---------------------------------------------------------------- */
  toggleForm() {
    let box = document.getElementById('live-form');
    if (box) { box.hidden = !box.hidden; return; }
    this.caseRoot.insertAdjacentHTML('beforebegin', `<div class="card" id="live-form" style="margin-bottom:1rem">
      <div class="card-title">Konfigurasi CloudSim live<span class="muted small">backend Java · CloudSim 7.0.1</span></div>
      <div id="live-form-body"></div>
      <div class="toolbar" style="margin-top:.75rem"><button class="btn btn-primary" data-act="run">Jalankan simulasi →</button>
        <div class="progress" style="flex:1;min-width:160px"><i data-ref="bar"></i></div><span class="note" data-ref="ptext"></span></div>
    </div>`);
    this.form.registerForm('live-form-body');
    document.querySelector('#live-form [data-act="run"]').addEventListener('click', () => this.runLive());
  }

  async runLive() {
    if (this.running) return;
    const box = document.getElementById('live-form');
    const bar = box.querySelector('[data-ref="bar"]'), text = box.querySelector('[data-ref="ptext"]');
    const btn = box.querySelector('[data-act="run"]');
    if (!this.form.isValid()) { text.textContent = 'Periksa parameter & distribusi VM.'; return; }
    this.running = true; btn.disabled = true;
    try {
      const { jobId } = await Api.submitSimulation(this.form.getConfig());
      let job;
      do {
        job = await Api.pollSimulation(jobId);
        bar.style.width = `${job.totalRuns ? job.completedRuns / job.totalRuns * 100 : 0}%`;
        text.textContent = `${job.completedRuns}/${job.totalRuns} run · ${job.currentAlgorithm || 'persiapan'}`;
        if (job.status === 'RUNNING') await new Promise(r => setTimeout(r, 700));
      } while (job.status === 'RUNNING');
      if (job.status !== 'SUCCEEDED') throw new Error(job.error?.message || job.status);
      text.textContent = `Selesai · CSV: ${job.result.exports?.metricsCsv || '-'}`;
      document.querySelectorAll('[data-snap]').forEach(s => { const o = s.querySelector('[value="__live"]'); if (o) { o.disabled = false; s.value = '__live'; } });
      this.setResult(job.result, 'live');
    } catch (e) {
      text.textContent = `Gagal: ${e.message}`;
    } finally {
      this.running = false; btn.disabled = false;
    }
  }

  provenance() {
    const { scenario: s, provenance: p } = this.result;
    const d = s.vmDistribution;
    return `<div class="provenance">
      <span><b>${esc(p.engine)} ${esc(p.engineVersion)}</b> · ${this.source === 'live' ? 'run live barusan' : 'snapshot run nyata'}</span>
      <span>${esc(p.dataset)} · ${s.taskCount} task · ${s.runs} run · seed ${s.seed}</span>
      <span>${s.datacenters} DC × ${s.hostsPerDatacenter} host × ${d.small + d.medium + d.large} VM/host</span>
      <span>${esc(p.timestampUtc?.slice(0, 19).replace('T', ' '))} UTC</span>
      <span>SHA-256 <code>${esc((p.datasetSha256 || '').slice(0, 16))}…</code></span></div>`;
  }

  /* ---------------------------------------------------------------- */
  renderCase() {
    const R = this.result, s = R.scenario;
    const vms = infraVms(s);
    const res = R.results.find(r => r.algorithm === this.algo);
    const rep = res.representativeRun;
    const sum = new Map(vmSummary(rep).map(v => [v.vmId, v]));
    const mk = res.metrics.makespan.mean;
    const repMk = Math.max(...[...sum.values()].map(v => v.lastFinish), 1);
    const rank = [...R.results].sort((a, b) => a.metrics.makespan.mean - b.metrics.makespan.mean).findIndex(r => r.algorithm === this.algo) + 1;
    const d = s.vmDistribution;
    const infra = mode => `<div class="infra" style="--dc:${s.datacenters}">${Array.from({ length: s.datacenters }, (_, dc) => `<div class="dc"><span>DC ${dc}</span><div class="hosts">
      ${Array.from({ length: s.hostsPerDatacenter }, (_, h) => `<div class="host"><span>H${h}</span>${vms.filter(v => v.dc === dc && v.h === h).map(v => {
        if (mode === 'type') return `<div class="vmsq ${v.t} type" title="VM ${v.id} · ${v.t}"></div>`;
        const x = sum.get(v.id);
        const u = x ? x.busy / (v.pes * repMk) : 0;
        return `<div class="vmsq" style="background:${heat(u)}" title="VM ${v.id} (${v.t}) · ${x ? x.tasks : 0} task · utilisasi ${fmt(u * 100, 0)}%"></div>`;
      }).join('')}</div>`).join('')}</div></div>`).join('')}</div>`;

    this.caseRoot.innerHTML = `
      <div class="ps-steps">
        <div class="card"><div class="ps-head"><b>1</b><h3>Masalah</h3></div>
          <div class="kpis" style="margin-bottom:.6rem"><div class="kpi"><b>${s.taskCount.toLocaleString('id-ID')}</b><span>job GoCJ</span></div><div class="kpi"><b>${vms.length}</b><span>VM heterogen</span></div></div>
          ${infra('type')}
          <div class="vm-legend" style="margin-top:.5rem"><span style="--gc:var(--vm-small)"><i></i>Small 500 MIPS</span><span style="--gc:var(--vm-medium)"><i></i>Medium 1000×2</span><span style="--gc:var(--vm-large)"><i></i>Large 2000×4</span></div>
          <p class="note" style="margin-top:.5rem">${d.small}/${d.medium}/${d.large} VM <b>per host</b>: perluasan dari skenario minimal tugas (5 VM per DC) agar beban 1000–10000 job realistis.</p></div>
        <div class="card"><div class="ps-head"><b>2</b><h3>Proses</h3></div>
          <div class="seg" role="group" aria-label="Algoritma" style="margin-bottom:.6rem">${R.results.map(r => `<button data-algo-case="${r.algorithm}" aria-pressed="${r.algorithm === this.algo}">${r.algorithm}</button>`).join('')}</div>
          ${infra('heat')}
          <div class="heat-legend"><span>0%</span><i></i><span>utilisasi VM 100%</span></div></div>
        <div class="card"><div class="ps-head"><b>3</b><h3>Solusi · ${esc(this.algo)}</h3><span class="chip ${algoCls(this.algo)}">#${rank} dari ${R.results.length} (makespan)</span></div>
          <div class="metric-chips">${METRICS.map(m => `<div class="metric-chip"><span>${m.label} ${m.higher ? '↑' : '↓'}</span><b>${fmt(res.metrics[m.key].mean, m.key === 'degreeOfImbalance' ? 2 : 1)}</b> <small class="muted">${m.unit}</small></div>`).join('')}</div>
          <p class="note" style="margin-top:.5rem">Mean ${s.runs} run (seed ${s.seed}…). Run yang divisualkan: makespan ${fmt(repMk, 0)} s.</p></div>
      </div>
      <div class="card" style="margin-top:1rem">
        <div class="card-title">Timeline CloudSim · ${esc(this.algo)} · run ${rep.runIndex + 1} (seed ${rep.seed})<span class="muted small">${rep.allocations.length ? `${rep.allocations.length.toLocaleString('id-ID')} cloudlet · baris = VM` : 'ringkasan per VM'}</span></div>
        ${rep.allocations.length ? '<canvas class="gantt-canvas" data-ref="gantt"></canvas>' : `<p class="note">Detail per-cloudlet tidak disertakan pada snapshot ${s.taskCount.toLocaleString('id-ID')} task agar situs ringan. Heatmap di atas memakai ringkasan per VM dari run yang sama. Pilih skenario 1000 task untuk timeline lengkap.</p>`}
      </div>
      <div style="margin-top:.75rem">${this.provenance()}</div>`;
    this.caseRoot.querySelectorAll('[data-algo-case]').forEach(b => b.addEventListener('click', () => { this.algo = b.dataset.algoCase; this.renderCase(); }));
    const canvas = this.caseRoot.querySelector('[data-ref="gantt"]');
    if (canvas) requestAnimationFrame(() => this.drawGantt(canvas, rep, vms));
  }

  drawGantt(canvas, rep, vms) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W) return;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const col = { S: css.getPropertyValue('--vm-small').trim(), M: css.getPropertyValue('--vm-medium').trim(), L: css.getPropertyValue('--vm-large').trim() };
    const L = 46, T = 6, B = 18;
    const mk = Math.max(...rep.allocations.map(a => a.finish));
    const rowH = (H - T - B) / vms.length;
    const X = t => L + (t / mk) * (W - L - 8);
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = css.getPropertyValue('--fg-faint').trim();
    vms.forEach((v, i) => { if (v.h === 0 && vms.indexOf(v) === vms.findIndex(x => x.dc === v.dc)) ctx.fillText(`DC${v.dc}`, 4, T + i * rowH + 9); });
    const byVm = new Map(vms.map((v, i) => [v.id, i]));
    ctx.globalAlpha = 0.8;
    for (const a of rep.allocations) {
      const i = byVm.get(a.vmId);
      if (i === undefined) continue;
      ctx.fillStyle = col[vms[i].t];
      ctx.fillRect(X(a.start), T + i * rowH + 0.5, Math.max(1, X(a.finish) - X(a.start) - 0.5), Math.max(1, rowH - 1));
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = css.getPropertyValue('--fg-faint').trim();
    [0, .25, .5, .75, 1].forEach(f => { ctx.fillText(`${Math.round(mk * f)} s`, Math.min(W - 40, X(mk * f)), H - 4); });
    ctx.strokeStyle = css.getPropertyValue('--error').trim();
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(X(mk), T); ctx.lineTo(X(mk), H - B); ctx.stroke();
  }

  /* ---------------------------------------------------------------- */
  renderEval() {
    const R = this.result;
    const m = METRICS.find(x => x.key === this.metric);
    const vals = R.results.map(r => ({ a: r.algorithm, v: r.metrics[m.key].mean, sd: r.metrics[m.key].stddev }));
    const best = (m.higher ? Math.max : Math.min)(...vals.map(x => x.v));
    const max = Math.max(...vals.map(x => x.v)) || 1;
    const sorted = [...vals].sort((a, b) => (m.higher ? b.v - a.v : a.v - b.v));
    const winners = METRICS.map(mm => {
      const vs = R.results.map(r => r.metrics[mm.key].mean);
      const b = (mm.higher ? Math.max : Math.min)(...vs);
      return [mm, R.results.filter(r => Math.abs(r.metrics[mm.key].mean - b) <= Math.abs(b) * 1e-6 + 1e-9).map(r => r.algorithm)];
    });
    const get = (a, k) => R.results.find(r => r.algorithm === a)?.metrics[k].mean;
    const phs = get('PHS', 'makespan'), csa = get('CSA', 'makespan'), rr = get('RR', 'makespan');

    this.evalRoot.innerHTML = `
      <div class="seg" role="group" aria-label="Metrik" style="margin-bottom:1rem">${METRICS.map(x => `<button data-metric="${x.key}" aria-pressed="${x.key === this.metric}">${x.label}</button>`).join('')}</div>
      <div class="split">
        <div class="card"><div class="card-title">${m.label} ${m.unit ? `(${m.unit})` : ''} · ${m.higher ? 'lebih tinggi lebih baik ↑' : 'lebih rendah lebih baik ↓'}<span class="muted small">mean ± sd, ${R.scenario.runs} run</span></div>
          <div class="bar-chart">${sorted.map(x => `<div class="bar-row ${algoCls(x.a)} ${x.v === best ? 'best' : ''}"><b>${x.a}</b>
            <div class="bar-track"><div class="bar-fill" style="width:${Math.max(1, x.v / max * 100).toFixed(1)}%"></div></div>
            <span class="bar-val">${fmt(x.v, 1)}${x.sd ? ` <span class="muted">±${fmt(x.sd, 1)}</span>` : ''}</span></div>`).join('')}</div></div>
        <div class="card"><div class="card-title">Bacaan cepat</div>
          <div class="kpis">
            <div class="kpi"><b>${fmt((1 - phs / rr) * 100, 0)}%</b><span>makespan PHS lebih cepat dari RR</span></div>
            <div class="kpi"><b>${fmt(csa / phs, 1)}×</b><span>makespan CSA vs PHS</span></div>
          </div>
          <div class="card-title" style="margin-top:1rem">Terbaik per metrik</div>
          <ul class="win-list">${winners.map(([mm, ws]) => `<li><span>${mm.label} ${mm.higher ? '↑' : '↓'}</span><span>${ws.map(w => `<span class="chip ${algoCls(w)}">${w}</span>`).join(' ')}</span></li>`).join('')}</ul>
        </div>
      </div>
      <div class="table-scroll" style="margin-top:1rem"><table class="data-table">
        <thead><tr><th>Algoritma</th>${METRICS.map(x => `<th data-metric="${x.key}" class="${x.key === this.metric ? 'sel' : ''}">${x.label} ${x.higher ? '↑' : '↓'}</th>`).join('')}</tr></thead>
        <tbody>${R.results.map(r => `<tr class="${algoCls(r.algorithm) ? `meta ${algoCls(r.algorithm)}` : ''}"><td>${r.algorithm}</td>${winners.map(([mm, ws]) =>
          `<td class="${ws.includes(r.algorithm) ? 'best' : ''}">${fmt(r.metrics[mm.key].mean, 2)}${R.scenario.runs > 1 ? ` <span class="sd">±${fmt(r.metrics[mm.key].stddev, 1)}</span>` : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div style="margin-top:.75rem">${this.provenance()}</div>`;
    this.evalRoot.querySelectorAll('[data-metric]').forEach(b => b.addEventListener('click', () => { this.metric = b.dataset.metric; this.renderEval(); }));
  }

  renderTakeaways() {
    const R = this.result;
    const get = (a, k) => R.results.find(r => r.algorithm === a)?.metrics[k].mean;
    const best = k => [...R.results].sort((a, b) => a.metrics[k].mean - b.metrics[k].mean)[0].algorithm;
    const rank = (a, k) => [...R.results].sort((x, y) => x.metrics[k].mean - y.metrics[k].mean).findIndex(r => r.algorithm === a) + 1;
    const n = R.results.length;
    const csaBehind = get('CSA', 'makespan') > get('PHS', 'makespan');
    const el = document.getElementById('takeaways');
    if (!get('CSA', 'makespan') || !get('PHS', 'makespan') || !get('RR', 'makespan')) {
      el.innerHTML = `<div class="takeaway" style="grid-column:1/-1"><div class="big">Run parsial</div><p>Kesimpulan otomatis membutuhkan CSA, PHS, dan RR dalam satu eksperimen. Pilih snapshot di slide 9/10 atau jalankan ketujuh algoritma.</p></div>`;
      return;
    }
    const phsMk = get('PHS', 'makespan');
    const bound = this.source === 'snapshot' ? MAKESPAN_LOWER_BOUND[R.scenario.taskCount] : undefined;
    const gap = bound ? phsMk / bound - 1 : 0;
    const heftNote = !bound ? ''
      : gap < 1e-6 ? ` Jadwalnya identik dengan seed HEFT di semua run, dan HEFT sudah menyentuh batas bawah teoretis (${fmt(bound, 0)} s), jadi tidak ada ruang untuk membaik.`
      : ` Jadwalnya identik dengan seed HEFT di semua run, ${fmt(gap * 100, 1)}% di atas batas bawah teoretis (${fmt(bound, 0)} s): improvisasi PHS gagal memperbaikinya.`;
    el.innerHTML = `
      <div class="takeaway phs"><div class="big">PHS #${rank('PHS', 'makespan')}</div><p>Makespan <b>${fmt(phsMk, 0)} s</b>, peringkat ${rank('PHS', 'makespan')} dari ${n}, ${fmt((1 - phsMk / get('RR', 'makespan')) * 100, 0)}% lebih cepat dari Round Robin.${heftNote}</p></div>
      <div class="takeaway"><div class="big">CSA #${rank('CSA', 'makespan')}</div><p>Mengejar <b>energi + waktu</b> sekaligus dari populasi acak. Makespan ${fmt(get('CSA', 'makespan'), 0)} s ${csaBehind ? `tertinggal dari PHS dalam budget ${R.scenario.csa?.generations ?? '–'} generasi` : 'mengungguli PHS'}: trade-off multi-objektif terlihat nyata.</p></div>
      <div class="takeaway"><div class="big">${best('totalCost')}</div><p>Biaya terendah (${fmt(get(best('totalCost'), 'totalCost'), 0)} G$), dan scheduling time heuristik ≪ metaheuristik. Tidak ada satu algoritma yang menang di semua metrik.</p></div>
      <p class="note" style="grid-column:1/-1">Angka: CloudSim 7, ${esc(R.provenance.dataset)}, ${R.scenario.runs} run, seed ${R.scenario.seed}. Ganti skenario di slide 9/10 untuk memperbarui kesimpulan.</p>`;
  }
}
