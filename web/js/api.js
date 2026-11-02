/**
 * Data layer. Uses the Java/CloudSim backend when it is reachable (localhost),
 * otherwise falls back to static files under data/ (GitHub Pages).
 * All paths are relative so the site works under any sub-path.
 */
const json = async (url, init) => {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.message || `${url} → HTTP ${res.status}`);
    err.code = data.error?.code || 'ERROR';
    throw err;
  }
  return data;
};

export const Api = {
  live: false,
  snapshots: [],

  async detectBackend() {
    // GitHub Pages never has the Java backend: skip the probe (avoids a 404 in the console).
    if (location.hostname.endsWith('github.io')) return this.loadIndex();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    try {
      const res = await fetch('api/datasets', { signal: ctrl.signal });
      this.live = res.ok && (res.headers.get('content-type') || '').includes('json');
    } catch {
      this.live = false;
    } finally {
      clearTimeout(timer);
    }
    return this.loadIndex();
  },

  async loadIndex() {
    try {
      this.snapshots = await json('data/results/index.json');
    } catch {
      this.snapshots = [];
    }
    return this.live;
  },

  async fetchDatasets() {
    return json(this.live ? 'api/datasets' : 'data/datasets.json');
  },

  /** First `limit` tasks of a GoCJ file (static mode serves the first 40). */
  async fetchDatasetTasks(filename, limit) {
    if (this.live) return json(`api/datasets/${encodeURIComponent(filename)}/tasks?limit=${limit}`);
    const data = await json(`data/gocj/${filename.replace(/\.csv$/, '.json')}`);
    return { ...data, tasks: data.tasks.slice(0, limit) };
  },

  async fetchSnapshot(file) {
    return json(`data/results/${file}`);
  },

  async submitSimulation(config) {
    return json('api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
  },

  async pollSimulation(jobId) {
    return json(`api/simulations/${encodeURIComponent(jobId)}`);
  }
};
