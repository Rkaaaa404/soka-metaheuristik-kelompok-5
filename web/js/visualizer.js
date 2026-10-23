import { csaStepGenerator } from './algorithms/csa.js';
import { phsStepGenerator } from './algorithms/phs.js';
import { decodeSchedule } from './algorithms/decoder.js';
import { Api } from './api.js';

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

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
    this.loadRevision = 0;
    this.sampleDirty = true;
    this.isLoading = false;
    this.displayedCandidate = null;
    this.animations = [];
    this.backendResult = null;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.stepBtn = document.getElementById('vis-btn-step');
    this.playBtn = document.getElementById('vis-btn-play');
    this.resetBtn = document.getElementById('vis-btn-reset');
    this.speedSelect = document.getElementById('vis-speed-select');
    this.statusMsg = document.getElementById('vis-status-msg');
    this.statusMsg?.setAttribute('role', 'status');
    this.statusMsg?.setAttribute('aria-live', 'polite');
    this.canvasContainer = document.getElementById('vis-canvas-container');
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
        if (this.backendResult) this.renderBackendResult(this.backendResult);
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
    document.getElementById('vis-sample-n')?.addEventListener('input', () => this.invalidate());
    // Delegation also catches advanced inputs, whose form callbacks may not fire.
    for (const id of ['slide-4-form-container', 'slide-5-form-container']) {
      const form = document.getElementById(id);
      form?.addEventListener('input', () => this.invalidate());
      form?.addEventListener('change', () => this.invalidate());
    }

    if (this.backendRunBtn) {
      this.backendRunBtn.addEventListener('click', () => this.runBackendSimulation?.());
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

  invalidate() {
    this.pause();
    this.loadRevision++;
    this.sampleDirty = true;
    this.isLoading = false;
    this.generator = null;
    this.lastState = null;
    this.displayedCandidate = null;
    this.animations.forEach(animation => animation.cancel());
    this.animations = [];
    if (this.statusMsg) this.statusMsg.textContent = 'Konfigurasi berubah. Tekan Reset untuk memuat sampel dan memulai ulang.';
    if (this.canvasContainer) this.canvasContainer.innerHTML = '';
    this.updatePlaybackControls();
  }

  updatePlaybackControls() {
    const disabled = this.isLoading || this.sampleDirty || !this.generator;
    if (this.stepBtn) this.stepBtn.disabled = disabled;
    if (this.playBtn) this.playBtn.disabled = disabled;
    if (this.resetBtn) this.resetBtn.disabled = this.isLoading;
  }

  async loadSampleData() {
    this.pause();
    const revision = ++this.loadRevision;
    const config = this.formManager.getConfig();
    const requested = Number.parseInt(document.getElementById('vis-sample-n')?.value) || 8;
    const limit = Math.min(config.taskCount, 30, Math.max(1, requested));
    this.isLoading = true;
    this.sampleDirty = true;
    this.generator = null;
    this.updatePlaybackControls();
    if (this.statusMsg) this.statusMsg.textContent = `Memuat ${limit} task asli dari ${config.dataset}…`;
    try {
      if (!this.formManager.isValid()) throw new Error('Periksa konfigurasi dan distribusi VM.');
      const resp = await Api.fetchDatasetTasks(config.dataset, limit);
      if (revision !== this.loadRevision) return;
      if (!Array.isArray(resp.tasks) || resp.tasks.length === 0) throw new Error('Dataset tidak mengembalikan task.');
      // The decoder uses dense task indices; retain dataset IDs separately for labels.
      this.sampleTasks = resp.tasks.map((task, index) => ({
        id: index,
        datasetId: task.id,
        lengthMi: task.lengthMi,
        sla: task.sla,
        arrivalTime: task.arrivalTime
      }));
      this.sampleDirty = false;
      this.isLoading = false;
      await this.reset();
    } catch (error) {
      if (revision !== this.loadRevision) return;
      this.sampleTasks = [];
      this.sampleVms = [];
      this.generator = null;
      this.sampleDirty = true;
      this.isLoading = false;
      if (this.canvasContainer) this.canvasContainer.innerHTML = '';
      if (this.statusMsg) this.statusMsg.textContent = `Sampel tidak tersedia: ${error.message} Tidak ada data sintetis. Tekan Reset untuk mencoba lagi.`;
      this.updatePlaybackControls();
    }
  }

  buildSampleVms(config) {
    this.sampleVms = [];
    let id = 0;
    const dist = config.vmDistribution;
    for (let dc = 0; dc < config.datacenters; dc++) {
      for (let h = 0; h < config.hostsPerDatacenter; h++) {
        for (let s = 0; s < dist.small; s++) {
          this.sampleVms.push({ id: id++, datacenterIndex: dc, hostIndex: h, type: 'Small', nominalMips: 500, pes: 1 });
        }
        for (let m = 0; m < dist.medium; m++) {
          this.sampleVms.push({ id: id++, datacenterIndex: dc, hostIndex: h, type: 'Medium', nominalMips: 1000, pes: 2 });
        }
        for (let l = 0; l < dist.large; l++) {
          this.sampleVms.push({ id: id++, datacenterIndex: dc, hostIndex: h, type: 'Large', nominalMips: 2000, pes: 4 });
        }
      }
    }
    if (this.sampleVms.length === 0) throw new Error('Skenario memerlukan setidaknya satu VM.');
    this.totalHosts = config.datacenters * config.hostsPerDatacenter;
  }

  async reset() {
    this.pause();
    if (this.isLoading) return;
    if (this.sampleDirty || this.sampleTasks.length === 0) return this.loadSampleData();
    const config = this.formManager.getConfig();
    this.buildSampleVms(config);
    this.displayedCandidate = null;
    this.lastState = null;
    this.animations.forEach(animation => animation.cancel());
    this.animations = [];
    if (this.canvasContainer) this.canvasContainer.innerHTML = '';
    if (this.currentAlgo === 'CSA') {
      const opts = {
        population: 6,
        selected: 3,
        generations: 10,
        beta: 1.0,
        timeWeight: config.csa.timeWeight
      };
      this.generator = csaStepGenerator(this.sampleTasks, this.sampleVms, opts, config.seed, this.totalHosts);
    } else {
      const opts = {
        memorySize: 4,
        iterations: 10,
        improvisations: 3
      };
      this.generator = phsStepGenerator(this.sampleTasks, this.sampleVms, opts, config.seed, this.totalHosts);
    }

    this.updatePlaybackControls();
    this.step();
  }

  step() {
    if (!this.generator) return;
    const res = this.generator.next();
    if (res.done) {
      this.pause();
      this.generator = null;
      this.updatePlaybackControls();
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
    if (!this.generator || this.isPlaying || this.sampleDirty || this.isLoading) return;
    this.isPlaying = true;
    if (this.playBtn) this.playBtn.textContent = 'Jeda';
    const interval = 1200 / this.speed;
    this.playTimer = setInterval(() => {
      this.step();
    }, interval);
  }

  pause() {
    this.isPlaying = false;
    if (this.playBtn) this.playBtn.textContent = 'Putar';
    if (this.playTimer) {
      clearInterval(this.playTimer);
      this.playTimer = null;
    }
  }

  renderState(state) {
    const previousPositions = new Map();
    this.canvasContainer?.querySelectorAll('[data-flow-task]').forEach(token => {
      previousPositions.set(Number(token.dataset.flowTask), token.getBoundingClientRect());
    });
    this.animations.forEach(animation => animation.cancel());
    this.animations = [];
    if (this.statusMsg) {
      this.statusMsg.textContent = state.message;
    }

    if (this.currentAlgo === 'CSA') {
      this.renderCsaView(state);
    } else {
      this.renderPhsView(state);
    }
    const candidate = state.probe || state.candidate || state.best;
    if (candidate) {
      this.renderTaskFlow(state, candidate, previousPositions);
      const valid = candidate.assignedVm.every(vm => candidate.capacityFactors[vm] > 0);
      this.displayedCandidate = candidate;
    }
  }

  phaseExplanation(state) {
    if (this.currentAlgo === 'CSA') {
      const phases = {
        INIT: ['Exploration', 'Penempatan acak membuka beberapa wilayah ruang solusi. Token menampilkan antibodi awal #0, bukan otomatis best.'],
        SELECTION: ['Exploitation', 'Parent dengan fitness terendah diprioritaskan. Token beralih ke parent peringkat pertama; ini pemilihan solusi, bukan mutasi.'],
        CLONING: ['Exploitation', 'Parent terbaik diperbanyak tanpa mengubah pemetaan. Token sengaja tetap: kloning belum memindahkan task.'],
        MUTATION: ['Exploration + exploitation', 'Clone parent berafinitas rendah menjelajah lebih jauh; parent terbaik dipertajam dengan mutasi lebih kecil. Ditampilkan clone dengan perubahan terbanyak dalam batch, bukan best-so-far.'],
        SURVIVOR: ['Exploitation', 'Parent dan clone bersaing berdasarkan fitness. Token menunjukkan penyintas teratas; archive tetap menyimpan trade-off makespan–energi.'],
        FINISHED: ['Solusi terpilih', 'Optimasi berakhir. Baru di fase ini token menunjukkan solusi final terbaik dari Pareto archive.']
      };
      return phases[state.phase];
    }
    if (state.phase === 'HARMONY_GENERATION') {
      const memoryOnly = state.scheduleMethod === 'HM Memory Copy' && state.resourceMethod === 'Resource HM Copy';
      return [memoryOnly ? 'Exploitation' : 'Exploration + memory',
        `Jadwal: ${state.scheduleMethod}; resource: ${state.resourceMethod}. Cabang acak menjelajah, salinan HM memakai pengalaman, crossbreed menggabungkan keduanya. Token menunjukkan kandidat mentah sebelum repair.`];
    }
    const phases = {
      INIT: ['Exploration + seed', 'Seed HEFT memberi titik awal terarah, sementara entri acak menjaga keragaman. Token menampilkan seed; kedua Harmony Memory tetap terlihat di bawah.'],
      IMPROVISATION_AND_REPAIR: ['Exploitation lokal', `Ritme ${state.rhythm} memperbaiki kandidat: Schedule mengubah urutan/penempatan; Resource mengubah faktor kapasitas. Repair memindahkan task dari VM nonaktif ke VM aktif.`],
      MEMORY_UPDATE: ['Seleksi memory', state.accepted
        ? 'Probe diterima menggantikan entri terburuk di memory ritme aktif. Token tetap menunjukkan probe yang baru dievaluasi.'
        : 'Probe ditolak karena tidak mengalahkan entri terburuk. Token tetap menunjukkan probe yang ditolak agar keputusan terlihat; HM dan best tidak dipalsukan.'],
      FINISHED: ['Solusi terpilih', 'Token beralih ke best-so-far akhir. Jadwal, kapasitas aktif, dan urutan task ini dipakai bersama oleh decoder.']
    };
    return phases[state.phase];
  }

  renderTaskFlow(state, candidate, previousPositions) {
    if (!this.canvasContainer) return;
    const previous = this.displayedCandidate;
    const [mode, explanation] = this.phaseExplanation(state);
    const changed = candidate.assignedVm.reduce((count, vm, index) =>
      count + (previous && previous.assignedVm[index] !== vm ? 1 : 0), 0);
    const changedCapacity = previous ? candidate.capacityFactors.reduce((count, capacity, index) =>
      count + (capacity !== previous.capacityFactors[index] ? 1 : 0), 0) : 0;
    const orderChanged = previous && candidate.taskOrder.some((task, index) => previous.taskOrder[index] !== task);
    const tasksByVm = this.sampleVms.map(() => []);
    for (const taskId of candidate.taskOrder) tasksByVm[candidate.assignedVm[taskId]].push(this.sampleTasks[taskId]);
    const descriptor = this.currentAlgo === 'CSA'
      ? `Antibodi #${candidate.id}${candidate.parentId !== undefined ? ` · parent #${candidate.parentId} · rank ${candidate.rank} · p(mutasi) ${(candidate.mutationRate * 100).toFixed(1)}% · ${candidate.mutatedIndices.length} gen berubah dari parent` : ''}`
      : state.phase === 'HARMONY_GENERATION' ? 'Kandidat mentah' : state.probe ? 'Probe yang dievaluasi' : state.phase === 'INIT' ? 'Seed HEFT' : 'Best final';
    this.canvasContainer.insertAdjacentHTML('afterbegin', `
      <section class="task-flow" aria-label="Pemetaan task ke VM pada fase saat ini">
        <div class="flow-heading">
          <div><span class="flow-eyebrow">${escapeHtml(mode)}</span><h4>${escapeHtml(descriptor)}</h4></div>
          <span class="flow-counter">${previous ? `${changed} task berpindah` : `${this.sampleTasks.length} task dialokasikan`}</span>
        </div>
        <p class="flow-explanation">${escapeHtml(explanation)}</p>
        <p class="flow-note">Sampel ${this.sampleTasks.length} task asli · ${this.sampleVms.length} VM · ${this.formManager.getConfig().datacenters} DC.
          Demo ringkas: ${this.currentAlgo === 'CSA' ? '6 antibodi, 3 parent, 10 generasi, beta 1' : '4 entri HM, 10 iterasi, 3 improvisasi'}.
          Animasi adalah perpindahan pemetaan antarkandidat, bukan migrasi CloudSim saat runtime.</p>
        <div class="flow-source"><span class="flow-source-dot"></span><strong>Sumber task · dataset GoCJ</strong><span>Token T = ID task dataset</span></div>
        <div class="flow-vm-grid">
          ${this.sampleVms.map((vm, index) => {
            const capacity = candidate.capacityFactors[index];
            const oldCapacity = previous?.capacityFactors[index];
            return `<section class="flow-vm ${capacity === 0 ? 'flow-vm-off' : ''}" data-flow-vm="${index}">
              <div class="flow-vm-heading"><strong>VM ${index}</strong><span>DC ${vm.datacenterIndex} · ${vm.type}</span></div>
              <div class="flow-capacity">${oldCapacity !== undefined && oldCapacity !== capacity ? `${oldCapacity * 100}% → ` : ''}${capacity * 100}% kapasitas · ${vm.pes} PE</div>
              <div class="flow-token-list">${tasksByVm[index].map(task => {
                const moved = !previous || previous.assignedVm[task.id] !== index;
                const from = previous ? `VM ${previous.assignedVm[task.id]}` : 'Sumber';
                return `<span class="flow-token ${moved ? 'flow-token-changed' : ''} ${capacity === 0 ? 'flow-token-invalid' : ''}"
                  data-flow-task="${task.id}" title="${from} → VM ${index}; ${task.lengthMi} MI${capacity === 0 ? '; menunggu repair' : ''}">T${escapeHtml(task.datasetId)}</span>`;
              }).join('') || '<span class="flow-empty">Tidak ada task</span>'}</div>
            </section>`;
          }).join('')}
        </div>
        <p class="flow-note flow-delta">${previous ? `${changed} perubahan VM · ${changedCapacity} perubahan kapasitas · urutan ${orderChanged ? 'berubah' : 'tetap'} dibanding kandidat visual sebelumnya.` : 'Penempatan awal dari sumber ke VM.'}
          ${previous && changed === 0 ? 'Tidak ada perpindahan task pada langkah ini; token tidak digerakkan secara buatan.' : ''}
          Token berbingkai putus-putus menunggu repair.</p>
        ${state.operations?.length ? `<p class="flow-operations"><strong>Operasi aktual:</strong> ${state.operations.map(escapeHtml).join(' · ')}</p>` : ''}
        <details class="flow-mapping"><summary>Pemetaan sebelum → sesudah & urutan task</summary>
          <p>Urutan sebelumnya: ${previous ? previous.taskOrder.map(id => `T${escapeHtml(this.sampleTasks[id].datasetId)}`).join(' → ') : 'Belum ada'}</p>
          <p>Urutan sekarang: ${candidate.taskOrder.map(id => `T${escapeHtml(this.sampleTasks[id].datasetId)}`).join(' → ')}</p>
          <div class="matrix-table-wrap"><table class="data-table small-table"><thead><tr><th>Task</th><th>Sebelum</th><th>Sesudah</th><th>Perubahan</th></tr></thead>
            <tbody>${this.sampleTasks.map(task => {
              const before = previous?.assignedVm[task.id];
              const after = candidate.assignedVm[task.id];
              return `<tr><th>T${escapeHtml(task.datasetId)}</th><td>${before === undefined ? 'Sumber' : `VM ${before}`}</td><td>VM ${after}</td><td>${before === undefined ? 'Awal' : before === after ? 'Tetap' : 'Pindah'}</td></tr>`;
            }).join('')}</tbody>
          </table></div>
        </details>
      </section>`);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;
    const source = this.canvasContainer.querySelector('.flow-source-dot').getBoundingClientRect();
    this.canvasContainer.querySelectorAll('[data-flow-task]').forEach(token => {
      const id = Number(token.dataset.flowTask);
      if (previous && previous.assignedVm[id] === candidate.assignedVm[id]) return;
      const before = previousPositions.get(id) || source;
      const after = token.getBoundingClientRect();
      if (!after.width || !token.animate) return;
      const animation = token.animate([
        { transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(.86)`, opacity: .5 },
        { transform: 'translate(0, 0) scale(1)', opacity: 1 }
      ], { duration: 850 / this.speed, easing: 'cubic-bezier(.22,.75,.25,1)' });
      this.animations.push(animation);
    });
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
                  ${this.sampleTasks.map(t => `<th>T${escapeHtml(t.datasetId)}</th>`).join('')}
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
                <div class="arch-id">Candidate #${a.id} ${state.best && state.best.id === a.id ? '(Best F)' : ''}</div>
                <div class="arch-metrics">
                  <span>Waktu ${a.makespan.toFixed(2)}s</span>
                  <span>Energi ${(a.energy / 1000).toFixed(1)} kJ</span>
                  <span>F: ${a.fitness.toFixed(3)}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    this.canvasContainer.innerHTML = html;

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
              <div class="hm-card ${sol.isHeftSeed ? 'seed-card' : ''}">
                <div class="hm-card-header">
                  <span>Entry #${idx} ${sol.isHeftSeed ? '(HEFT Seed)' : ''}</span>
                  <span class="makespan-tag">${sol.makespan.toFixed(2)}s</span>
                </div>
                <div class="hm-card-body">
                  <div class="order-seq">Urutan: [${sol.taskOrder.map(id => `T${escapeHtml(this.sampleTasks[id].datasetId)}`).join(', ')}]</div>
                  <div class="assign-seq">${sol.assignedVm.map((vm, id) => `T${escapeHtml(this.sampleTasks[id].datasetId)}: VM ${vm}`).join(' · ')}</div>
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

  }



  renderBackendResult(result) {
    this.backendResult = result;
    const algoRes = result.results.find(item => item.algorithm === this.currentAlgo);
    if (!algoRes || !this.backendResultArea) return;
    const rep = algoRes.representativeRun;
    const metrics = algoRes.metrics;

    let html = `
      <div class="backend-summary-card">
        <h4>Hasil CloudSim Nyata: ${algoRes.algorithm}</h4>
        <p><a href="#slide-5">Lihat perbandingan seluruh 7 algoritma dan lokasi CSV lokal di slide 5</a></p>
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
