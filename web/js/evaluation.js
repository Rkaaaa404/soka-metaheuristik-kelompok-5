import { Api } from './api.js';

const ALGORITHMS = ['CSA', 'PHS', 'FCFS', 'RR', 'SJF', 'MinMin', 'MaxMin'];
const METRICS = [
  ['makespan', 'Makespan', 's', false],
  ['averageWaitingTime', 'Waiting', 's', false],
  ['averageExecutionTime', 'Execution', 's', false],
  ['averageTurnaroundTime', 'Turnaround', 's', false],
  ['throughput', 'Throughput', 'task/s', true],
  ['resourceUtilization', 'Utilization', '%', true],
  ['degreeOfImbalance', 'Imbalance', '', false],
  ['totalCost', 'Cost', 'G$', false],
  ['schedulingTime', 'Scheduling', 'ms', false]
];
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fingerprint = config => JSON.stringify(config, [
  'dataset', 'taskCount', 'datacenters', 'hostsPerDatacenter', 'vmsPerDatacenter',
  'vmDistribution', 'small', 'medium', 'large', 'runs', 'seed',
  'csa', 'population', 'selected', 'generations', 'beta', 'timeWeight',
  'phs', 'memorySize', 'iterations', 'improvisations'
]);
export class EvaluationManager {
  constructor(formManager) {
    this.formManager = formManager;
    this.currentResult = null;
    this.isStale = false;
    this.isRunning = false;
    this.loaded = false;
    this.runBtn = document.getElementById('eval-btn-run');
    this.progressBar = document.getElementById('eval-progress-bar');
    this.progressText = document.getElementById('eval-progress-text');
    this.progressBox = document.getElementById('eval-progress-box');
    this.tableContainer = document.getElementById('eval-table-container');
    this.provenanceInfo = document.getElementById('eval-provenance-info');
    this.staleBanner = document.getElementById('eval-stale-banner');
    this.summary = document.getElementById('eval-timeline-container');
    this.runBtn.addEventListener('click', () => this.runEvaluation());
  }

  markStale() {
    this.isStale = !!this.currentResult && this.resultConfig !== fingerprint(this.formManager.getConfig());
    this.updateStaleBanner();
  }

  async loadInitialData() {
    if (this.loaded || this.isRunning || this.currentResult) return;
    this.loaded = true;
    this.setRunning(true);
    try {
      const response = await Api.fetchDefaultResult();
      if (response.status === 200) this.acceptResult(response.data, true);
      else await this.pollJob(response.data.jobId);
    } catch (error) {
      this.showError(error.message);
      this.loaded = false;
    } finally {
      this.setRunning(false);
    }
  }

  async runEvaluation() {
    if (this.isRunning) return;
    if (!this.formManager.isValid()) {
      this.showError('Periksa batas parameter dan total distribusi VM sebelum menjalankan simulasi.');
      return;
    }
    const config = this.formManager.getConfig();
    this.loaded = true;
    this.setRunning(true);
    this.showProgress(0, config.runs * config.algorithms.length, 'Memulai eksperimen baru CloudSim');
    try {
      const { jobId } = await Api.submitSimulation(config);
      await this.pollJob(jobId);
    } catch (error) {
      this.showError(error.message);
    } finally {
      this.setRunning(false);
    }
  }

  async pollJob(jobId) {
    let job;
    do {
      job = await Api.pollSimulation(jobId);
      this.showProgress(job.completedRuns, job.totalRuns, `${job.currentAlgorithm || 'Persiapan'} · run ${job.currentRun ?? 0}`);
      if (job.status === 'RUNNING') await new Promise(resolve => setTimeout(resolve, 700));
    } while (job.status === 'RUNNING');
    if (job.status !== 'SUCCEEDED') throw new Error(job.error?.message || `Eksperimen ${job.status}`);
    this.acceptResult(job.result, false);
  }

  acceptResult(result, cached) {
    this.currentResult = result;
    this.loaded = true;
    this.resultConfig = fingerprint(result.scenario);
    this.renderTable(result, cached);
    this.markStale();
    this.onResult?.(result);
  }

  setRunning(running) {
    this.isRunning = running;
    this.runBtn.disabled = running;
    this.runBtn.textContent = running ? 'Eksperimen berlangsung…' : 'Run semua 7 algoritma';
    const backendButton = document.getElementById('vis-backend-run');
    backendButton.disabled = running;
    backendButton.textContent = running ? 'Eksperimen berlangsung…' : 'Run CloudSim · semua 7 algoritma';
    if (!running) this.progressBox.style.display = 'none';
  }

  showProgress(completed, total, detail) {
    this.progressBox.style.display = 'block';
    this.progressBar.style.width = `${total ? completed / total * 100 : 0}%`;
    const text = `${completed} / ${total} run selesai — ${detail}`;
    this.progressText.textContent = text;
    this.onProgress?.(text);
  }

  showError(message) {
    this.staleBanner.style.display = 'block';
    this.staleBanner.textContent = `Eksperimen tidak selesai: ${message}. ${this.currentResult ? 'Hasil sebelumnya tetap ditampilkan; bukan hasil percobaan yang gagal.' : 'Belum ada hasil untuk dianalisis.'}`;
    this.onError?.(message);
  }

  updateStaleBanner() {
    this.staleBanner.style.display = this.isStale ? 'block' : 'none';
    this.staleBanner.textContent = 'Konfigurasi berbeda — hasil di bawah berasal dari eksperimen sebelumnya. Run ulang untuk konfigurasi saat ini.';
  }

  renderTable({ scenario, provenance, results, exports }, cached) {
    this.provenanceInfo.innerHTML = `<div class="provenance-bar">
      <span><strong>${escape(provenance.engine)} ${escape(provenance.engineVersion)}</strong> · ${cached ? 'cache run nyata' : 'eksperimen baru'}</span>
      <span>${escape(provenance.dataset)} · ${scenario.taskCount} task · ${scenario.runs} run · seed ${scenario.seed}</span>
      <span>${scenario.datacenters} DC · ${scenario.hostsPerDatacenter} host/DC · ${scenario.vmsPerDatacenter} VM/DC</span>
      <span>${escape(provenance.timestampUtc)}</span>
      <span>SHA-256 dataset: <code>${escape(provenance.datasetSha256 || provenance.datasetSha256Hash || '')}</code></span>
      ${exports?.metricsCsv ? `<span>CSV lokal: <code>${escape(exports.metricsCsv)}</code></span>` : ''}
    </div>`;
    const best = Object.fromEntries(METRICS.map(([key, , , higher]) => [key, (higher ? Math.max : Math.min)(...results.map(r => r.metrics[key].mean))]));
    const wins = (r, key) => Math.abs(r.metrics[key].mean - best[key]) <= Math.max(1, Math.abs(best[key])) * 1e-9;
    this.tableContainer.innerHTML = `<p class="text-muted">${scenario.runs > 1 ? 'Mean ± simpangan baku sampel' : 'n = 1; simpangan baku 0, belum mengukur variasi antar-run'}. Sel bertanda terbaik mengikuti arah tiap metrik; nilai seri ditandai bersama.</p>
      <div class="table-scroll-container" tabindex="0" aria-label="Tabel sembilan metrik, geser horizontal">
      <table class="data-table eval-table"><thead><tr><th class="sticky-col">Algoritma</th>${METRICS.map(([, label, unit, higher]) => `<th>${label} ${higher ? '↑' : '↓'}<br><small>${unit}</small></th>`).join('')}</tr></thead>
      <tbody>${results.map(r => `<tr class="${['CSA', 'PHS'].includes(r.algorithm) ? 'row-metaheuristic' : ''}"><th class="sticky-col" scope="row">${escape(r.algorithm)}</th>${METRICS.map(([key]) => {
        const value = r.metrics[key];
        const format = n => n > 0 && n < .01 ? n.toExponential(2) : n.toFixed(2);
        return `<td class="${wins(r, key) ? 'metric-best' : ''}"><span class="m-mean">${format(value.mean)}</span>${scenario.runs > 1 ? `<span class="m-sd"> ± ${format(value.stddev)}</span>` : ''}${wins(r, key) ? '<small class="best-label">Terbaik</small>' : ''}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>`;
    const names = key => results.filter(r => wins(r, key)).map(r => r.algorithm).join(', ');
    this.summary.innerHTML = `<div class="evaluation-summary"><h3>Membaca hasil eksperimen</h3>
      <p><strong>Jika prioritasnya waktu penyelesaian: ${names('makespan')}.</strong> Peringkat ini berdasarkan mean makespan pada skenario yang tercatat, bukan jaminan unggul pada workload lain.</p>
      <p>Biaya CPU terendah: <strong>${names('totalCost')}</strong>. Beban paling seimbang: <strong>${names('degreeOfImbalance')}</strong>. Overhead penjadwalan terendah: <strong>${names('schedulingTime')}</strong>.</p>
      <p>Tidak ada skor gabungan tanpa bobot tujuan yang disepakati. Throughput memakai N/makespan sehingga bukan bukti kemenangan independen. Scheduling time adalah wall-clock dan dapat berubah antar-run.</p>
      <p>Turnaround = submit → selesai. Metrik berasal dari seluruh task; pemetaan pada slide 4 adalah run pertama, bukan jadwal rata-rata.</p></div>`;
  }
}
