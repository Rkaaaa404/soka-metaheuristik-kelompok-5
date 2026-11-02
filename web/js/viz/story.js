/**
 * Generic stepper for storyboard animations. The stage root gets
 * data-step="n" plus cumulative classes ge1..geN so CSS can reveal
 * elements progressively; `onStep` lets JS-driven scenes react too.
 */
export class Story {
  constructor(root, { steps, init, onStep, interval = 4200, mapping = null }) {
    this.root = root;
    this.steps = steps;
    this.onStep = onStep;
    this.interval = interval;
    this.mapping = mapping;
    this.step = 0;
    this.timer = null;
    root.innerHTML = `
      <div class="story-stage"></div>
      <div class="story-bar">
        <button class="btn btn-icon" data-act="prev" aria-label="Langkah sebelumnya">‹</button>
        <button class="btn btn-icon" data-act="play" aria-label="Putar otomatis">▶</button>
        <button class="btn btn-icon" data-act="next" aria-label="Langkah berikutnya">›</button>
        <div class="story-steps" role="tablist">${steps.map((s, i) =>
          `<button role="tab" data-i="${i}">${i + 1}. ${s.label}</button>`).join('')}</div>
      </div>
      <p class="story-caption" aria-live="polite"></p>`;
    this.stage = root.querySelector('.story-stage');
    this.caption = root.querySelector('.story-caption');
    this.playBtn = root.querySelector('[data-act="play"]');
    init(this.stage);
    root.querySelector('[data-act="prev"]').addEventListener('click', () => { this.stop(); this.go(this.step - 1); });
    root.querySelector('[data-act="next"]').addEventListener('click', () => { this.stop(); this.go(this.step + 1); });
    this.playBtn.addEventListener('click', () => (this.timer ? this.stop() : this.play()));
    root.querySelectorAll('.story-steps button').forEach(b =>
      b.addEventListener('click', () => { this.stop(); this.go(+b.dataset.i); }));
    mapping?.querySelectorAll('.map-row').forEach(row =>
      row.addEventListener('click', () => { this.stop(); this.go(+row.dataset.step - 1); }));
    this.go(0);
  }

  go(i) {
    const n = this.steps.length;
    this.step = ((i % n) + n) % n;
    const s = this.step + 1;
    this.stage.dataset.step = s;
    for (let k = 1; k <= n; k++) this.stage.classList.toggle(`ge${k}`, s >= k);
    this.root.querySelectorAll('.story-steps button').forEach((b, k) => {
      if (k === this.step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    this.caption.innerHTML = this.steps[this.step].caption;
    this.mapping?.querySelectorAll('.map-row').forEach(r => r.classList.toggle('on', +r.dataset.step === s));
    this.onStep?.(s, this.stage);
  }

  play() {
    if (this.timer) return;
    this.playBtn.textContent = '❚❚';
    this.playBtn.setAttribute('aria-label', 'Jeda');
    this.timer = setInterval(() => this.go(this.step + 1), this.interval);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.playBtn.textContent = '▶';
    this.playBtn.setAttribute('aria-label', 'Putar otomatis');
  }

  /** Called by the app when the slide becomes active / inactive. */
  enter() { this.go(0); this.play(); }
  leave() { this.stop(); }
}
