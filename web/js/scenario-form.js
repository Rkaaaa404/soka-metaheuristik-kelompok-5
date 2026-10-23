/**
 * Synchronized Scenario Form state and component for Slide 4.
 */
const ALGO_IDS = ['CSA', 'PHS', 'FCFS', 'RR', 'SJF', 'MinMin', 'MaxMin'];

export class ScenarioFormManager {
  constructor(onChangeCallback) {
    this.onChangeCallback = onChangeCallback;
    this.state = {
      dataset: "GoCJ_Dataset_1000.csv",
      taskCount: 1000,
      datacenters: 2,
      hostsPerDatacenter: 5,
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
    this.datasets = datasets || [];
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
          <label for="${container.id}-taskCount">Jumlah Task (N)</label>
          <select id="${container.id}-taskCount" class="form-input">
            <option value="1000" ${this.state.taskCount === 1000 ? 'selected' : ''}>1.000 task</option>
            <option value="2000" ${this.state.taskCount === 2000 ? 'selected' : ''}>2.000 task</option>
            <option value="3000" ${this.state.taskCount === 3000 ? 'selected' : ''}>3.000 task</option>
            <option value="4000" ${this.state.taskCount === 4000 ? 'selected' : ''}>4.000 task</option>
            <option value="5000" ${this.state.taskCount === 5000 ? 'selected' : ''}>5.000 task</option>
            <option value="6000" ${this.state.taskCount === 6000 ? 'selected' : ''}>6.000 task</option>
            <option value="7000" ${this.state.taskCount === 7000 ? 'selected' : ''}>7.000 task</option>
            <option value="8000" ${this.state.taskCount === 8000 ? 'selected' : ''}>8.000 task</option>
            <option value="9000" ${this.state.taskCount === 9000 ? 'selected' : ''}>9.000 task</option>
            <option value="10000" ${this.state.taskCount === 10000 ? 'selected' : ''}>10.000 task</option>
          </select>
        </div>

        <div class="form-group">
          <label for="${container.id}-datacenters">Datacenter (DC)</label>
          <input type="number" id="${container.id}-datacenters" class="form-input" min="1" max="10" value="${this.state.datacenters}">
        </div>

        <div class="form-group">
          <label for="${container.id}-hosts">Host per DC</label>
          <input type="number" id="${container.id}-hosts" class="form-input" min="1" max="50" value="${this.state.hostsPerDatacenter}">
        </div>

        <div class="form-group full-width">
          <label>Komposisi VM per Host:</label>
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
        </div>

        <div class="form-group">
          <label for="${container.id}-runs">Jumlah Run</label>
          <input type="number" id="${container.id}-runs" class="form-input" min="1" max="10" value="${this.state.runs}">
        </div>

        <div class="form-group">
          <label for="${container.id}-seed">RNG Seed (uint32)</label>
          <input type="number" id="${container.id}-seed" class="form-input" min="0" max="4294967295" value="${this.state.seed}">
        </div>

        <div class="form-group full-width">
          <label>Algoritma yang dijalankan:</label>
          <div class="algo-check-row">
            <label class="algo-check-label">
              <input type="checkbox" id="${container.id}-algo-all" class="algo-check-all"> <span>Semua</span>
            </label>
            <span class="algo-check-sep" aria-hidden="true">|</span>
            <label class="algo-check-label badge-metaheuristic">
              <input type="checkbox" id="${container.id}-algo-CSA" class="algo-check" value="CSA" checked> <span>CSA</span>
            </label>
            <label class="algo-check-label badge-metaheuristic">
              <input type="checkbox" id="${container.id}-algo-PHS" class="algo-check" value="PHS" checked> <span>PHS</span>
            </label>
            <label class="algo-check-label">
              <input type="checkbox" id="${container.id}-algo-FCFS" class="algo-check" value="FCFS" checked> <span>FCFS</span>
            </label>
            <label class="algo-check-label">
              <input type="checkbox" id="${container.id}-algo-RR" class="algo-check" value="RR" checked> <span>RR</span>
            </label>
            <label class="algo-check-label">
              <input type="checkbox" id="${container.id}-algo-SJF" class="algo-check" value="SJF" checked> <span>SJF</span>
            </label>
            <label class="algo-check-label">
              <input type="checkbox" id="${container.id}-algo-MinMin" class="algo-check" value="MinMin" checked> <span>MinMin</span>
            </label>
            <label class="algo-check-label">
              <input type="checkbox" id="${container.id}-algo-MaxMin" class="algo-check" value="MaxMin" checked> <span>MaxMin</span>
            </label>
          </div>
          <div id="${container.id}-algo-error" class="validation-msg text-error" style="display:none;">Pilih minimal satu algoritma.</div>
        </div>
      </div>

      <details class="advanced-settings">
        <summary>Pengaturan Lanjutan Metaheuristik (CSA &amp; PHS)</summary>
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
    this.validateAlgorithms(container.id);
  }

  bindEvents(container) {
    const id = container.id;
    const getEl = (sub) => document.getElementById(`${id}-${sub}`);

    const syncField = (key, val) => {
      this.state[key] = val;
      this.syncAllForms();
    };

    getEl('taskCount').addEventListener('change', (e) => {
      const val = parseInt(e.target.value) || 1000;
      this.state.taskCount = val;
      this.state.dataset = `GoCJ_Dataset_${val}.csv`;
      this.syncAllForms();
    });

    getEl('datacenters').addEventListener('input', (e) => syncField('datacenters', parseInt(e.target.value) || 1));
    getEl('hosts').addEventListener('input', (e) => syncField('hostsPerDatacenter', parseInt(e.target.value) || 1));

    const updateVmDist = () => {
      const s = parseInt(getEl('vm-small').value) || 0;
      const m = parseInt(getEl('vm-medium').value) || 0;
      const l = parseInt(getEl('vm-large').value) || 0;
      this.state.vmDistribution = { small: s, medium: m, large: l };
      this.syncAllForms();
    };

    getEl('vm-small').addEventListener('input', updateVmDist);
    getEl('vm-medium').addEventListener('input', updateVmDist);
    getEl('vm-large').addEventListener('input', updateVmDist);

    getEl('runs').addEventListener('input', (e) => syncField('runs', parseInt(e.target.value) || 1));
    getEl('seed').addEventListener('input', (e) => syncField('seed', parseInt(e.target.value) || 0));

    // CSA advanced
    const advanced = (field, group, key) => {
      getEl(field).addEventListener('input', e => {
        this.state[group][key] = e.target.valueAsNumber;
        this.syncAllForms();
      });
    };
    advanced('csa-p', 'csa', 'population');
    advanced('csa-k', 'csa', 'selected');
    advanced('csa-g', 'csa', 'generations');
    advanced('csa-beta', 'csa', 'beta');
    advanced('csa-w', 'csa', 'timeWeight');
    advanced('phs-hms', 'phs', 'memorySize');
    advanced('phs-iter', 'phs', 'iterations');
    advanced('phs-imp', 'phs', 'improvisations');

    const syncAlgoState = () => {
      this.state.algorithms = ALGO_IDS.filter(a => getEl(`algo-${a}`)?.checked);
      this.syncAllForms();
    };

    ALGO_IDS.forEach(a => getEl(`algo-${a}`).addEventListener('change', syncAlgoState));

    getEl('algo-all').addEventListener('change', () => {
      const allOn = this.state.algorithms.length === ALGO_IDS.length;
      this.state.algorithms = allOn ? [] : [...ALGO_IDS];
      this.syncAllForms();
    });
  }

  validateAlgorithms(containerId) {
    const errEl = document.getElementById(`${containerId}-algo-error`);
    if (!errEl) return this.state.algorithms.length >= 1;
    const valid = this.state.algorithms.length >= 1;
    errEl.style.display = valid ? 'none' : 'block';
    return valid;
  }

  isValid() {
    const validInputs = [...this.boundForms].every(form =>
      [...form.querySelectorAll('input, select')].every(input => input.value !== '' && input.checkValidity()));
    const vmTotal = this.state.vmDistribution.small + this.state.vmDistribution.medium + this.state.vmDistribution.large;
    return validInputs
      && vmTotal >= 1
      && this.state.csa.selected <= this.state.csa.population
      && this.state.algorithms.length >= 1;
  }

  syncAllForms() {
    for (const form of this.boundForms) {
      const id = form.id;
      const setVal = (sub, v) => {
        const el = document.getElementById(`${id}-${sub}`);
        if (el && el.value !== String(v) && document.activeElement !== el) el.value = v;
      };

      setVal('taskCount', this.state.taskCount);
      setVal('datacenters', this.state.datacenters);
      setVal('hosts', this.state.hostsPerDatacenter);
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

      ALGO_IDS.forEach(a => {
        const el = document.getElementById(`${id}-algo-${a}`);
        if (el && document.activeElement !== el) {
          el.checked = this.state.algorithms.includes(a);
        }
      });
      const allEl = document.getElementById(`${id}-algo-all`);
      if (allEl) {
        const count = this.state.algorithms.length;
        allEl.checked = count === ALGO_IDS.length;
        allEl.indeterminate = count > 0 && count < ALGO_IDS.length;
      }
      this.validateAlgorithms(id);
    }
    this.onChangeCallback?.(this.state);
  }

  getConfig() {
    const cfg = JSON.parse(JSON.stringify(this.state));
    cfg.dataset = `GoCJ_Dataset_${cfg.taskCount}.csv`;
    const vmsPerHost = cfg.vmDistribution.small + cfg.vmDistribution.medium + cfg.vmDistribution.large;
    cfg.vmsPerDatacenter = cfg.hostsPerDatacenter * vmsPerHost;
    return cfg;
  }
}
