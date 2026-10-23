import { csaStepGenerator } from './algorithms/csa.js';
import { phsStepGenerator } from './algorithms/phs.js';
import { decodeSchedule } from './algorithms/decoder.js';
import { Api } from './api.js';

export class Visualizer {
  constructor(formManager) {
    this.formManager = formManager;
    this.currentMode = 'js'; // 'js' | 'backend'
    this.currentAlgo = 'CSA'; // 'CSA' | 'PHS'
    this.speed = 1.0;
    this.isPlaying = false;
    this.playTimer = null;

    this.sampleTasks = [];
    this.sampleVms = [];
    this.generator = null;
    this.lastState = null;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.stepBtn = document.getElementById('vis-btn-step');
    this.playBtn = document.getElementById('vis-btn-play');
    this.resetBtn = document.getElementById('vis-btn-reset');
    this.speedSelect = document.getElementById('vis-speed-select');
    this.statusMsg = document.getElementById('vis-status-msg');
    this.canvasContainer = document.getElementById('vis-canvas-container');
    this.timelineContainer = document.getElementById('vis-timeline-container');
    this.backendRunBtn = document.getElementById('vis-backend-run');
    this.backendResultArea = document.getElementById('vis-backend-result');
  }

  bindEvents() {
    // Mode toggles
    document.querySelectorAll('.vis-mode-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.vis-mode-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        this.currentMode = e.target.dataset.mode;
        this.updateModeVisibility();
      });
    });

    // Algo toggles
    document.querySelectorAll('.vis-algo-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.vis-algo-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        this.currentAlgo = e.target.dataset.algo;
        this.reset();
      });
    });

    if (this.stepBtn) this.stepBtn.addEventListener('click', () => this.step());
    if (this.playBtn) this.playBtn.addEventListener('click', () => this.togglePlay());
    if (this.resetBtn) this.resetBtn.addEventListener('click', () => this.reset());
    if (this.speedSelect) this.speedSelect.addEventListener('change', (e) => {
      this.speed = parseFloat(e.target.value) || 1.0;
      if (this.isPlaying) {
        this.pause();
        this.play();
      }
    });

    if (this.backendRunBtn) {
      this.backendRunBtn.addEventListener('click', () => this.runBackendSimulation());
    }
  }

  updateModeVisibility() {
    const jsPanel = document.getElementById('vis-js-panel');
    const bePanel = document.getElementById('vis-backend-panel');
    if (this.currentMode === 'js') {
      if (jsPanel) jsPanel.style.display = 'block';
      if (bePanel) bePanel.style.display = 'none';
    } else {
      this.pause();
      if (jsPanel) jsPanel.style.display = 'none';
      if (bePanel) bePanel.style.display = 'block';
    }
  }

  async loadSampleData() {
    const config = this.formManager.getConfig();
    const limit = Math.min(30, Math.max(4, parseInt(document.getElementById('vis-sample-n')?.value) || 8));
    try {
      const resp = await Api.fetchDatasetTasks(config.dataset, limit);
      this.sampleTasks = resp.tasks.map(t => ({
        id: t.id,
        lengthMi: t.lengthMi,
        sla: t.sla,
        arrivalTime: t.arrivalTime
      }));
    } catch (e) {
      // Fallback synthetic if offline
      this.sampleTasks = Array.from({ length: limit }, (_, i) => ({
        id: i,
        lengthMi: 10000 + (i * 5000),
        sla: (i % 3) + 1,
        arrivalTime: i * 0.5
      }));
    }

    // Build sample VMs
    this.buildSampleVms(config);
    this.reset();
  }

  buildSampleVms(config) {
    this.sampleVms = [];
    let id = 0;
    const dist = config.vmDistribution;
    for (let dc = 0; dc < Math.min(2, config.datacenters); dc++) {
      for (let s = 0; s < dist.small; s++) {
        this.sampleVms.push({ id: id++, datacenterIndex: dc, hostIndex: 0, type: 'Small', nominalMips: 500, pes: 1 });
      }
      for (let m = 0; m < dist.medium; m++) {
        this.sampleVms.push({ id: id++, datacenterIndex: dc, hostIndex: 0, type: 'Medium', nominalMips: 1000, pes: 2 });
      }
      for (let l = 0; l < dist.large; l++) {
        this.sampleVms.push({ id: id++, datacenterIndex: dc, hostIndex: 0, type: 'Large', nominalMips: 2000, pes: 4 });
      }
    }
    if (this.sampleVms.length === 0) {
      this.sampleVms.push({ id: 0, datacenterIndex: 0, hostIndex: 0, type: 'Medium', nominalMips: 1000, pes: 1 });
    }
  }

  reset() {
    this.pause();
    const config = this.formManager.getConfig();
    this.buildSampleVms(config);

    if (this.currentAlgo === 'CSA') {
      const opts = {
        population: 6,
        selected: 3,
        generations: 10,
        beta: 1.0,
        timeWeight: config.csa.timeWeight
      };
      this.generator = csaStepGenerator(this.sampleTasks, this.sampleVms, opts, config.seed, 2);
    } else {
      const opts = {
        memorySize: 4,
        iterations: 10,
        improvisations: 3
      };
      this.generator = phsStepGenerator(this.sampleTasks, this.sampleVms, opts, config.seed, 2);
    }

    this.step();
  }

  step() {
    if (!this.generator) return;
    const res = this.generator.next();
    if (res.done) {
      this.pause();
      if (this.statusMsg) this.statusMsg.textContent = "Simulasi interaktif selesai.";
      return;
    }

    this.lastState = res.value;
    this.renderState(this.lastState);
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    this.isPlaying = true;
    if (this.playBtn) this.playBtn.textContent = 'Pause ⏸';
    const interval = 1200 / this.speed;
    this.playTimer = setInterval(() => {
      this.step();
    }, interval);
  }

  pause() {
    this.isPlaying = false;
    if (this.playBtn) this.playBtn.textContent = 'Play ▶';
    if (this.playTimer) {
      clearInterval(this.playTimer);
      this.playTimer = null;
    }
  }

  renderState(state) {
    if (this.statusMsg) {
      this.statusMsg.textContent = state.message;
    }

    if (this.currentAlgo === 'CSA') {
      this.renderCsaView(state);
    } else {
      this.renderPhsView(state);
    }
  }

  renderCsaView(state) {
    if (!this.canvasContainer) return;

    let html = `
      <div class="vis-header-info">
        <span class="badge">Fase: <strong>${state.phase}</strong></span>
        <span class="badge">Generasi: <strong>${state.generation} / ${state.maxGenerations}</strong></span>
        <span class="badge">Pareto Archive: <strong>${state.archive.length} solusi</strong></span>
        ${state.best ? `<span class="badge badge-accent">Best Makespan: <strong>${state.best.makespan.toFixed(2)}s</strong></span>` : ''}
      </div>

      <div class="csa-layout">
        <div class="pop-matrix-card">
          <h4>Populasi Antibodi (Solusi Penjadwalan)</h4>
          <div class="matrix-table-wrap">
            <table class="data-table small-table">
              <thead>
                <tr>
                  <th>Ab ID</th>
                  ${this.sampleTasks.map(t => `<th>T${t.id}</th>`).join('')}
                  <th>Makespan</th>
                  <th>Fitness (F)</th>
                </tr>
              </thead>
              <tbody>
                ${state.population.map(ab => `
                  <tr class="${state.parents && state.parents.some(p => p.id === ab.id) ? 'row-selected' : ''}">
                    <td><strong>#${ab.id}</strong></td>
                    ${ab.assignedVm.map(v => `<td class="vm-cell vm-${this.sampleVms[v]?.type.toLowerCase() || 'small'}">VM ${v}</td>`).join('')}
                    <td>${ab.makespan.toFixed(1)}s</td>
                    <td>${ab.fitness.toFixed(3)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="archive-card">
          <h4>Pareto Front Archive (Non-Dominated Tradeoffs)</h4>
          <div class="archive-list">
            ${state.archive.map(a => `
              <div class="archive-item ${state.best && state.best.id === a.id ? 'best-item' : ''}">
                <div class="arch-id">Candidate #${a.id} ${state.best && state.best.id === a.id ? '⭐ (Best F)' : ''}</div>
                <div class="arch-metrics">
                  <span>⏱ ${a.makespan.toFixed(2)}s</span>
                  <span>⚡ ${(a.energy / 1000).toFixed(1)} kJ</span>
                  <span>F: ${a.fitness.toFixed(3)}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    this.canvasContainer.innerHTML = html;

    // Render timeline for best candidate
    if (state.best) {
      const plan = {
        taskOrder: [...this.sampleTasks.map(t => t.id)],
        assignedVm: state.best.assignedVm,
        capacityFactors: new Array(this.sampleVms.length).fill(1.0)
      };
      this.renderTimeline(plan, state.best.makespan);
    }
  }

  renderPhsView(state) {
    if (!this.canvasContainer) return;

    let html = `
      <div class="vis-header-info">
        <span class="badge">Fase: <strong>${state.phase}</strong></span>
        <span class="badge">Iterasi: <strong>${state.iteration || 0} / ${state.maxIterations}</strong></span>
        ${state.rhythm ? `<span class="badge badge-accent">Ritme Aktif: <strong>${state.rhythm}</strong></span>` : ''}
        ${state.best ? `<span class="badge badge-success">Best Makespan: <strong>${state.best.makespan.toFixed(2)}s</strong></span>` : ''}
      </div>

      <div class="phs-layout">
        <div class="hm-column">
          <h4>Harmony Memory: Schedule</h4>
          <div class="hm-list">
            ${state.scheduleHm.map((sol, idx) => `
              <div class="hm-card ${idx === 0 ? 'seed-card' : ''}">
                <div class="hm-card-header">
                  <span>Entry #${idx} ${idx === 0 ? '(HEFT Seed)' : ''}</span>
                  <span class="makespan-tag">${sol.makespan.toFixed(2)}s</span>
                </div>
                <div class="hm-card-body">
                  <div class="order-seq">Urutan: [${sol.taskOrder.join(', ')}]</div>
                  <div class="assign-seq">VM: [${sol.assignedVm.join(', ')}]</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="hm-column">
          <h4>Harmony Memory: Resource</h4>
          <div class="hm-list">
            ${state.resourceHm.map((sol, idx) => `
              <div class="hm-card">
                <div class="hm-card-header">
                  <span>Entry #${idx}</span>
                  <span class="makespan-tag">${sol.makespan.toFixed(2)}s</span>
                </div>
                <div class="hm-card-body">
                  <div class="resource-factors">
                    ${sol.capacityFactors.map((cap, v) => `
                      <span class="cap-chip ${cap === 0 ? 'cap-zero' : cap === 0.5 ? 'cap-half' : 'cap-full'}">
                        VM ${v}: ${cap * 100}%
                      </span>
                    `).join('')}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    this.canvasContainer.innerHTML = html;

    if (state.best) {
      const plan = {
        taskOrder: state.best.taskOrder,
        assignedVm: state.best.assignedVm,
        capacityFactors: state.best.capacityFactors
      };
      this.renderTimeline(plan, state.best.makespan);
    }
  }

  renderTimeline(plan, makespan) {
    if (!this.timelineContainer) return;
    const dec = decodeSchedule(this.sampleTasks, this.sampleVms, plan, 2);

    let html = `
      <div class="timeline-header">
        <h4>Gantt Timeline Jadwal (Ilustrasi JS, bukan CloudSim) — Makespan: ${dec.makespan.toFixed(2)}s</h4>
      </div>
      <div class="timeline-body">
    `;

    for (let v = 0; v < this.sampleVms.length; v++) {
      const vm = this.sampleVms[v];
      const cap = plan.capacityFactors[v];
      const vmTasks = [];
      for (let i = 0; i < this.sampleTasks.length; i++) {
        if (plan.assignedVm[i] === v) {
          vmTasks.push({
            id: i,
            start: dec.startTimes[i],
            finish: dec.finishTimes[i],
            pe: dec.assignedPe[i]
          });
        }
      }

      const isInactive = cap === 0;

      html += `
        <div class="timeline-row ${isInactive ? 'row-inactive' : ''}">
          <div class="row-label">
            <strong>VM ${v} (${vm.type})</strong>
            <span class="cap-label">${cap * 100}% cap</span>
          </div>
          <div class="row-track">
            ${isInactive ? '<span class="inactive-text">VM Dinonaktifkan (PHS)</span>' : ''}
            ${vmTasks.map(t => {
              const leftPct = makespan > 0 ? (t.start / makespan) * 100 : 0;
              const widthPct = makespan > 0 ? ((t.finish - t.start) / makespan) * 100 : 0;
              return `
                <div class="timeline-block block-vm-${vm.type.toLowerCase()}" style="left: ${leftPct}%; width: ${Math.max(widthPct, 2)}%;">
                  <span>T${t.id}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    html += `</div>`;
    this.timelineContainer.innerHTML = html;
  }

  async runBackendSimulation() {
    if (!this.formManager.isValid()) {
      alert("Distribusi VM tidak cocok dengan total VM per datacenter!");
      return;
    }

    const config = this.formManager.getConfig();
    config.algorithms = [this.currentAlgo];
    config.runs = 1; // single representative run for inspection

    this.backendRunBtn.disabled = true;
    this.backendRunBtn.textContent = 'Menjalankan CloudSim di Backend...';
    this.backendResultArea.innerHTML = '<div class="loader-box"><div class="spinner"></div><p>Simulasi CloudSim 7 nyata sedang dijalankan di backend child process...</p></div>';

    try {
      const submitRes = await Api.submitSimulation(config);
      const jobId = submitRes.jobId;

      // Poll until finished
      let job;
      do {
        await new Promise(r => setTimeout(r, 800));
        job = await Api.pollSimulation(jobId);
      } while (job.status === 'RUNNING');

      if (job.status === 'SUCCEEDED') {
        this.renderBackendResult(job.result);
      } else {
        this.backendResultArea.innerHTML = `<div class="alert alert-error">Gagal: ${job.error?.message || 'Simulasi gagal'}</div>`;
      }
    } catch (e) {
      this.backendResultArea.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
    } finally {
      this.backendRunBtn.disabled = false;
      this.backendRunBtn.textContent = 'Jalankan CloudSim Nyata';
    }
  }

  renderBackendResult(result) {
    const algoRes = result.results[0];
    const rep = algoRes.representativeRun;
    const metrics = algoRes.metrics;

    let html = `
      <div class="backend-summary-card">
        <h4>Hasil CloudSim Nyata: ${algoRes.algorithm}</h4>
        <div class="provenance-tag">
          Engine: ${result.provenance.engine} ${result.provenance.engineVersion} | Dataset: ${result.provenance.dataset} (${result.scenario.taskCount} task) | Model: ${result.provenance.modelRevision}
        </div>
        <div class="metrics-chip-grid">
          ${Object.entries(metrics).map(([k, v]) => `
            <div class="metric-chip">
              <span class="m-label">${k}</span>
              <span class="m-val">${v.mean.toFixed(2)} ${v.unit}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="allocation-table-wrap">
        <h4>Pemetaan Alokasi Task → VM Nyata (50 task pertama)</h4>
        <table class="data-table">
          <thead>
            <tr>
              <th>Task ID</th>
              <th>VM ID</th>
              <th>Datacenter</th>
              <th>Host</th>
              <th>Arrival (s)</th>
              <th>Start (s)</th>
              <th>Finish (s)</th>
              <th>CPU Time (s)</th>
              <th>SLA</th>
            </tr>
          </thead>
          <tbody>
            ${rep.allocations.slice(0, 50).map(a => `
              <tr>
                <td>#${a.taskId}</td>
                <td>VM ${a.vmId}</td>
                <td>DC ${a.datacenterIndex}</td>
                <td>Host ${a.hostIndex}</td>
                <td>${a.arrival.toFixed(2)}</td>
                <td>${a.start.toFixed(2)}</td>
                <td>${a.finish.toFixed(2)}</td>
                <td>${a.cpuTime.toFixed(2)}</td>
                <td>SLA ${a.sla}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    this.backendResultArea.innerHTML = html;
  }
}
