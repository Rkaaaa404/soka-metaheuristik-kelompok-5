import { Api } from './api.js';

export class EvaluationManager {
  constructor(formManager) {
    this.formManager = formManager;
    this.currentResult = null;
    this.isStale = false;
    this.isRunning = false;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.runBtn = document.getElementById('eval-btn-run');
    this.progressBar = document.getElementById('eval-progress-bar');
    this.progressText = document.getElementById('eval-progress-text');
    this.progressBox = document.getElementById('eval-progress-box');
    this.tableContainer = document.getElementById('eval-table-container');
    this.provenanceInfo = document.getElementById('eval-provenance-info');
    this.staleBanner = document.getElementById('eval-stale-banner');
    this.timelineContainer = document.getElementById('eval-timeline-container');
  }

  bindEvents() {
    if (this.runBtn) {
      this.runBtn.addEventListener('click', () => this.runEvaluation());
    }

    // When form config changes, mark results as stale
    this.formManager.onChangeCallback = (newConfig) => {
      if (this.currentResult) {
        this.isStale = true;
        this.updateStaleBanner();
      }
    };
  }

  async loadInitialData() {
    try {
      const resp = await Api.fetchDefaultResult();
      if (resp.status === 200) {
        this.currentResult = resp.data;
        this.isStale = false;
        this.renderTable(resp.data);
      } else if (resp.status === 202) {
        // Default job started in background, poll it
        this.pollDefaultJob(resp.data.jobId);
      }
    } catch (e) {
      this.tableContainer.innerHTML = `<div class="alert alert-info">Tekan <strong>Jalankan Evaluasi (Run)</strong> untuk mensimulasikan seluruh 7 algoritma dengan CloudSim.</div>`;
    }
  }

  async pollDefaultJob(jobId) {
    this.showProgress(0, 35, "Menjalankan baseline default 1000 task (CloudSim)...");
    try {
      let job;
      do {
        await new Promise(r => setTimeout(r, 1000));
        job = await Api.pollSimulation(jobId);
        this.showProgress(job.completedRuns, job.totalRuns, `Menjalankan ${job.currentAlgorithm} (Run ${job.currentRun})...`);
      } while (job.status === 'RUNNING');

      this.hideProgress();
      if (job.status === 'SUCCEEDED') {
        this.currentResult = job.result;
        this.isStale = false;
        this.renderTable(job.result);
      }
    } catch (e) {
      this.hideProgress();
    }
  }

  async runEvaluation() {
    if (!this.formManager.isValid()) {
      alert("Distribusi VM tidak cocok dengan total VM per datacenter!");
      return;
    }

    const config = this.formManager.getConfig();
    config.algorithms = ["CSA", "PHS", "FCFS", "RR", "SJF", "MinMin", "MaxMin"];

    this.isRunning = true;
    if (this.runBtn) {
      this.runBtn.disabled = true;
      this.runBtn.textContent = 'Simulasi Berjalan...';
    }

    const totalRuns = config.algorithms.length * config.runs;
    this.showProgress(0, totalRuns, "Memulai simulasi CloudSim di proses anak backend...");

    try {
      const submitRes = await Api.submitSimulation(config);
      const jobId = submitRes.jobId;

      let job;
      do {
        await new Promise(r => setTimeout(r, 1000));
        job = await Api.pollSimulation(jobId);
        this.showProgress(job.completedRuns, job.totalRuns, `Menjalankan ${job.currentAlgorithm} (Run ${job.currentRun})...`);
      } while (job.status === 'RUNNING');

      this.hideProgress();

      if (job.status === 'SUCCEEDED') {
        this.currentResult = job.result;
        this.isStale = false;
        this.updateStaleBanner();
        this.renderTable(job.result);
      } else {
        const msg = job.error?.message || "Simulasi gagal dijalankan";
        this.tableContainer.innerHTML = `<div class="alert alert-error"><strong>Gagal:</strong> ${msg}</div>`;
      }
    } catch (e) {
      this.hideProgress();
      this.tableContainer.innerHTML = `<div class="alert alert-error"><strong>Error:</strong> ${e.message}</div>`;
    } finally {
      this.isRunning = false;
      if (this.runBtn) {
        this.runBtn.disabled = false;
        this.runBtn.textContent = 'Jalankan Evaluasi (Run Semua)';
      }
    }
  }

  showProgress(completed, total, text) {
    if (this.progressBox) this.progressBox.style.display = 'block';
    const pct = total > 0 ? (completed / total) * 100 : 0;
    if (this.progressBar) this.progressBar.style.width = `${pct}%`;
    if (this.progressText) this.progressText.textContent = `${completed} / ${total} run selesai (${pct.toFixed(0)}%) — ${text}`;
  }

  hideProgress() {
    if (this.progressBox) this.progressBox.style.display = 'none';
  }

  updateStaleBanner() {
    if (!this.staleBanner) return;
    if (this.isStale) {
      this.staleBanner.style.display = 'block';
      this.staleBanner.innerHTML = `⚠️ <em>Konfigurasi form telah diubah dari hasil simulasi yang ditampilkan di bawah. Tekan tombol Run untuk memperbarui tabel.</em>`;
    } else {
      this.staleBanner.style.display = 'none';
    }
  }

  renderTable(payload) {
    const { scenario, provenance, results } = payload;

    // Render provenance
    if (this.provenanceInfo) {
      this.provenanceInfo.innerHTML = `
        <div class="provenance-bar">
          <span>📦 <strong>Engine:</strong> ${provenance.engine} ${provenance.engineVersion}</span>
          <span>📊 <strong>Dataset:</strong> ${provenance.dataset} (${scenario.taskCount} task)</span>
          <span>🖥️ <strong>Infrastruktur:</strong> ${scenario.datacenters} DC, ${scenario.hostsPerDatacenter} Host/DC, ${scenario.vmsPerDatacenter} VM/DC</span>
          <span>🔁 <strong>Runs:</strong> ${scenario.runs} (Seed: ${scenario.seed})</span>
          <span>🕒 <strong>Timestamp:</strong> ${new Date(provenance.timestampUtc).toLocaleString()}</span>
        </div>
      `;
    }

    const metricHeaders = [
      { key: 'makespan', label: 'Makespan', dir: '↓', unit: 's' },
      { key: 'averageWaitingTime', label: 'Avg Waiting', dir: '↓', unit: 's' },
      { key: 'averageExecutionTime', label: 'Avg Execution', dir: '↓', unit: 's' },
      { key: 'averageTurnaroundTime', label: 'Avg Turnaround', dir: '↓', unit: 's' },
      { key: 'throughput', label: 'Throughput', dir: '↑', unit: 't/s' },
      { key: 'resourceUtilization', label: 'Utilization', dir: '↑', unit: '%' },
      { key: 'degreeOfImbalance', label: 'DI', dir: '↓', unit: '' },
      { key: 'totalCost', label: 'Cost', dir: '↓', unit: 'G$' },
      { key: 'schedulingTime', label: 'Sched Time', dir: '↓', unit: 'ms' }
    ];

    let html = `
      <div class="table-scroll-container">
        <table class="data-table eval-table">
          <thead>
            <tr>
              <th class="sticky-col">Algoritma</th>
              ${metricHeaders.map(m => `
                <th>
                  <div class="m-head">
                    <span>${m.label}</span>
                    <span class="dir-badge">${m.dir}</span>
                  </div>
                  <small class="unit-label">${m.unit}</small>
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${results.map(r => `
              <tr class="${r.algorithm === 'CSA' || r.algorithm === 'PHS' ? 'row-metaheuristic' : ''}">
                <td class="sticky-col">
                  <strong>${r.algorithm}</strong>
                  ${r.algorithm === 'CSA' ? '<span class="tag-meta">Metaheuristic</span>' : r.algorithm === 'PHS' ? '<span class="tag-meta">Metaheuristic</span>' : '<span class="tag-base">Baseline</span>'}
                </td>
                ${metricHeaders.map(m => {
                  const val = r.metrics[m.key];
                  if (!val) return '<td>-</td>';
                  const meanStr = val.mean < 0.01 && val.mean > 0 ? val.mean.toExponential(2) : val.mean.toFixed(2);
                  const sdStr = scenario.runs > 1 ? ` ± ${val.stddev.toFixed(2)}` : '';
                  return `<td><span class="m-mean">${meanStr}</span><span class="m-sd">${sdStr}</span></td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    this.tableContainer.innerHTML = html;

    // Render timeline comparison for CSA vs PHS vs FCFS
    this.renderComparisonTimeline(results, scenario);
  }

  renderComparisonTimeline(results, scenario) {
    if (!this.timelineContainer) return;
    const focusAlgos = ['CSA', 'PHS', 'FCFS'];
    const filtered = results.filter(r => focusAlgos.includes(r.algorithm));
    if (filtered.length === 0) return;

    let html = `
      <div class="comp-timeline-card">
        <h4>Visualisasi Perbandingan Alokasi Run Pertama (100 task pertama)</h4>
        <div class="comp-bars">
          ${filtered.map(r => {
            const makespan = r.metrics.makespan.mean;
            return `
              <div class="comp-row">
                <div class="comp-name"><strong>${r.algorithm}</strong> (${makespan.toFixed(1)}s)</div>
                <div class="comp-bar-track">
                  <div class="comp-bar-fill" style="width: ${Math.min(100, (makespan / 500) * 100)}%;">
                    <span>${makespan.toFixed(2)}s</span>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
    this.timelineContainer.innerHTML = html;
  }
}
