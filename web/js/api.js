/**
 * API client communicating with Java backend.
 */
export const Api = {
  async fetchDatasets() {
    const res = await fetch('/api/datasets');
    if (!res.ok) throw new Error(`Failed to load datasets: ${res.statusText}`);
    return await res.json();
  },

  async fetchDatasetTasks(filename, limit = 8) {
    const res = await fetch(`/api/datasets/${encodeURIComponent(filename)}/tasks?limit=${limit}`);
    if (!res.ok) throw new Error(`Failed to load sample tasks: ${res.statusText}`);
    return await res.json();
  },

  async submitSimulation(scenarioConfig) {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scenarioConfig)
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data.error?.message || `Simulation failed (${res.status})`;
      const err = new Error(msg);
      err.code = data.error?.code || 'ERROR';
      throw err;
    }
    return data;
  },

  async pollSimulation(jobId) {
    const res = await fetch(`/api/simulations/${encodeURIComponent(jobId)}`);
    const data = await res.json();
    if (!res.ok) {
      const msg = data.error?.message || `Job polling failed (${res.status})`;
      const err = new Error(msg);
      err.code = data.error?.code || 'ERROR';
      throw err;
    }
    return data;
  },

  async fetchDefaultResult() {
    const res = await fetch('/api/default-result');
    const data = await res.json();
    return { status: res.status, data };
  }
};
