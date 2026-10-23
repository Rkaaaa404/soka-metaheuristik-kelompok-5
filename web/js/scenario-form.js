/**
 * Synchronized Scenario Form state and component for Slide 4 and Slide 5.
 */
export class ScenarioFormManager {
  constructor(onChangeCallback) {
    this.onChangeCallback = onChangeCallback;
    this.state = {
      dataset: "GoCJ_Dataset_1000.csv",
      taskCount: 1000,
      datacenters: 2,
      hostsPerDatacenter: 5,
      vmsPerDatacenter: 5,
      vmDistribution: { small: 2, medium: 2, large: 1 },
      runs: 5,
      seed: 42,
      algorithms: ["CSA", "PHS", "FCFS", "RR", "SJF", "MinMin", "MaxMin"],
      csa: { population: 30, selected: 10, generations: 200, beta: 1.0, timeWeight: 0.5 },
      phs: { memorySize: 10, iterations: 200, improvisations: 3 }
    };
    this.datasets = [];
    this.boundForms = new Set();
  }

  setDatasets(datasets) {
    this.datasets = datasets;
    this.updateAllSelects();
  }

  registerForm(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    this.boundForms.add(container);
    this.renderForm(container);
  }

  renderForm(container) {
    container.innerHTML = `
      <div class="form-grid">
        <div class="form-group">
          <label for="${container.id}-dataset">Dataset GoCJ</label>
          <select id="${container.id}-dataset" class="form-input dataset-select">
            <option value="GoCJ_Dataset_1000.csv">GoCJ_Dataset_1000.csv (1000 task)</option>
          </select>
        </div>

        <div class="form-group">
          <label for="${container.id}-taskCount">Jumlah Task (N)</label>
          <input type="number" id="${container.id}-taskCount" class="form-input" min="1" max="10000" value="${this.state.taskCount}">
        </div>

        <div class="form-group">
          <label for="${container.id}-datacenters">Datacenter (DC)</label>
          <input type="number" id="${container.id}-datacenters" class="form-input" min="1" max="10" value="${this.state.datacenters}">
        </div>

        <div class="form-group">
          <label for="${container.id}-hosts">Host per DC</label>
          <input type="number" id="${container.id}-hosts" class="form-input" min="1" max="50" value="${this.state.hostsPerDatacenter}">
        </div>

        <div class="form-group">
          <label for="${container.id}-vms">VM per DC</label>
          <input type="number" id="${container.id}-vms" class="form-input" min="1" max="100" value="${this.state.vmsPerDatacenter}">
        </div>

        <div class="form-group full-width">
          <label>Komposisi Tipe VM per Datacenter (Total harus = VM per DC):</label>
          <div class="vm-dist-row">
            <div class="vm-badge-input badge-small">
              <span>Small (500 MIPS, 1 PE)</span>
              <input type="number" id="${container.id}-vm-small" class="form-input small-input" min="0" value="${this.state.vmDistribution.small}">
            </div>
            <div class="vm-badge-input badge-medium">
              <span>Medium (1000 MIPS, 2 PE)</span>
              <input type="number" id="${container.id}-vm-medium" class="form-input small-input" min="0" value="${this.state.vmDistribution.medium}">
            </div>
            <div class="vm-badge-input badge-large">
              <span>Large (2000 MIPS, 4 PE)</span>
              <input type="number" id="${container.id}-vm-large" class="form-input small-input" min="0" value="${this.state.vmDistribution.large}">
            </div>
          </div>
          <div id="${container.id}-dist-error" class="validation-msg text-error" style="display:none;"></div>
        </div>

        <div class="form-group">
          <label for="${container.id}-runs">Jumlah Run</label>
          <input type="number" id="${container.id}-runs" class="form-input" min="1" max="10" value="${this.state.runs}">
        </div>

        <div class="form-group">
          <label for="${container.id}-seed">RNG Seed (uint32)</label>
          <input type="number" id="${container.id}-seed" class="form-input" min="0" max="4294967295" value="${this.state.seed}">
        </div>
      </div>

      <details class="advanced-settings">
        <summary>Pengaturan Lanjutan Metaheuristik (CSA & PHS)</summary>
        <div class="adv-grid">
          <div class="adv-col">
            <h4>CSA (Clonal Selection)</h4>
            <label>Populasi (P): <input type="number" id="${container.id}-csa-p" class="form-input" min="2" max="100" value="${this.state.csa.population}"></label>
            <label>Parent Terpilih (K): <input type="number" id="${container.id}-csa-k" class="form-input" min="1" max="100" value="${this.state.csa.selected}"></label>
            <label>Generasi: <input type="number" id="${container.id}-csa-g" class="form-input" min="1" max="10000" value="${this.state.csa.generations}"></label>
            <label>Beta (&beta;): <input type="number" id="${container.id}-csa-beta" class="form-input" min="0.1" max="5.0" step="0.1" value="${this.state.csa.beta}"></label>
            <label>Bobot Waktu (w): <input type="number" id="${container.id}-csa-w" class="form-input" min="0.0" max="1.0" step="0.05" value="${this.state.csa.timeWeight}"></label>
          </div>
          <div class="adv-col">
            <h4>PHS (Harmony Search)</h4>
            <label>Memory Size (HMS): <input type="number" id="${container.id}-phs-hms" class="form-input" min="2" max="50" value="${this.state.phs.memorySize}"></label>
            <label>Iterasi: <input type="number" id="${container.id}-phs-iter" class="form-input" min="1" max="10000" value="${this.state.phs.iterations}"></label>
            <label>Improvisasi: <input type="number" id="${container.id}-phs-imp" class="form-input" min="1" max="10" value="${this.state.phs.improvisations}"></label>
          </div>
        </div>
      </details>
    `;

    this.bindEvents(container);
    this.updateAllSelects();
    this.validateDistribution(container.id);
  }

  updateAllSelects() {
    if (!this.datasets || this.datasets.length === 0) return;
    for (const form of this.boundForms) {
      const select = form.querySelector('.dataset-select');
      if (!select) continue;
      const currentVal = this.state.dataset;
      select.innerHTML = this.datasets.map(d =>
        `<option value="${d.filename}" ${d.filename === currentVal ? 'selected' : ''}>${d.filename} (${d.rowCount} task)</option>`
      ).join('');
    }
  }

  bindEvents(container) {
    const id = container.id;
    const getEl = (sub) => document.getElementById(`${id}-${sub}`);

    const syncField = (key, val) => {
      this.state[key] = val;
      this.syncAllForms();
      if (this.onChangeCallback) this.onChangeCallback(this.state);
    };

    getEl('dataset').addEventListener('change', (e) => {
      const ds = this.datasets.find(d => d.filename === e.target.value);
      this.state.dataset = e.target.value;
      if (ds && this.state.taskCount > ds.rowCount) {
        this.state.taskCount = ds.rowCount;
      }
      this.syncAllForms();
      if (this.onChangeCallback) this.onChangeCallback(this.state);
    });

    getEl('taskCount').addEventListener('input', (e) => syncField('taskCount', parseInt(e.target.value) || 1));
    getEl('datacenters').addEventListener('input', (e) => syncField('datacenters', parseInt(e.target.value) || 1));
    getEl('hosts').addEventListener('input', (e) => syncField('hostsPerDatacenter', parseInt(e.target.value) || 1));

    getEl('vms').addEventListener('input', (e) => {
      this.state.vmsPerDatacenter = parseInt(e.target.value) || 1;
      this.validateDistribution(id);
      this.syncAllForms();
      if (this.onChangeCallback) this.onChangeCallback(this.state);
    });

    const updateVmDist = () => {
      const s = parseInt(getEl('vm-small').value) || 0;
      const m = parseInt(getEl('vm-medium').value) || 0;
      const l = parseInt(getEl('vm-large').value) || 0;
      this.state.vmDistribution = { small: s, medium: m, large: l };
      this.validateDistribution(id);
      this.syncAllForms();
      if (this.onChangeCallback) this.onChangeCallback(this.state);
    };

    getEl('vm-small').addEventListener('input', updateVmDist);
    getEl('vm-medium').addEventListener('input', updateVmDist);
    getEl('vm-large').addEventListener('input', updateVmDist);

    getEl('runs').addEventListener('input', (e) => syncField('runs', parseInt(e.target.value) || 1));
    getEl('seed').addEventListener('input', (e) => syncField('seed', parseInt(e.target.value) || 0));

    // CSA advanced
    getEl('csa-p').addEventListener('input', (e) => { this.state.csa.population = parseInt(e.target.value) || 2; this.syncAllForms(); });
    getEl('csa-k').addEventListener('input', (e) => { this.state.csa.selected = parseInt(e.target.value) || 1; this.syncAllForms(); });
    getEl('csa-g').addEventListener('input', (e) => { this.state.csa.generations = parseInt(e.target.value) || 1; this.syncAllForms(); });
    getEl('csa-beta').addEventListener('input', (e) => { this.state.csa.beta = parseFloat(e.target.value) || 1.0; this.syncAllForms(); });
    getEl('csa-w').addEventListener('input', (e) => { this.state.csa.timeWeight = parseFloat(e.target.value) || 0.5; this.syncAllForms(); });

    // PHS advanced
    getEl('phs-hms').addEventListener('input', (e) => { this.state.phs.memorySize = parseInt(e.target.value) || 2; this.syncAllForms(); });
    getEl('phs-iter').addEventListener('input', (e) => { this.state.phs.iterations = parseInt(e.target.value) || 1; this.syncAllForms(); });
    getEl('phs-imp').addEventListener('input', (e) => { this.state.phs.improvisations = parseInt(e.target.value) || 1; this.syncAllForms(); });
  }

  validateDistribution(containerId) {
    const sum = this.state.vmDistribution.small + this.state.vmDistribution.medium + this.state.vmDistribution.large;
    const target = this.state.vmsPerDatacenter;
    const errEl = document.getElementById(`${containerId}-dist-error`);
    if (!errEl) return sum === target;

    if (sum !== target) {
      errEl.style.display = "block";
      errEl.textContent = `Total distribusi (${sum}) tidak sesuai dengan VM per Datacenter (${target})!`;
      return false;
    } else {
      errEl.style.display = "none";
      return true;
    }
  }

  isValid() {
    const sum = this.state.vmDistribution.small + this.state.vmDistribution.medium + this.state.vmDistribution.large;
    return sum === this.state.vmsPerDatacenter;
  }

  syncAllForms() {
    for (const form of this.boundForms) {
      const id = form.id;
      const setVal = (sub, v) => {
        const el = document.getElementById(`${id}-${sub}`);
        if (el && el.value !== String(v) && document.activeElement !== el) el.value = v;
      };

      setVal('dataset', this.state.dataset);
      setVal('taskCount', this.state.taskCount);
      setVal('datacenters', this.state.datacenters);
      setVal('hosts', this.state.hostsPerDatacenter);
      setVal('vms', this.state.vmsPerDatacenter);
      setVal('vm-small', this.state.vmDistribution.small);
      setVal('vm-medium', this.state.vmDistribution.medium);
      setVal('vm-large', this.state.vmDistribution.large);
      setVal('runs', this.state.runs);
      setVal('seed', this.state.seed);

      setVal('csa-p', this.state.csa.population);
      setVal('csa-k', this.state.csa.selected);
      setVal('csa-g', this.state.csa.generations);
      setVal('csa-beta', this.state.csa.beta);
      setVal('csa-w', this.state.csa.timeWeight);

      setVal('phs-hms', this.state.phs.memorySize);
      setVal('phs-iter', this.state.phs.iterations);
      setVal('phs-imp', this.state.phs.improvisations);

      this.validateDistribution(id);
    }
  }

  getConfig() {
    return JSON.parse(JSON.stringify(this.state));
  }
}
