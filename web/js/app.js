import { Api } from './api.js';
import { mountCover, mountProblem, mountSpaceCounter, mountLandscape, mountImmune, mountJazz } from './viz/scenes.js';
import { mountCsaFlow, mountPhsFlow } from './viz/flows.js';
import { Lab } from './viz/lab.js';
import { Results } from './results.js';

class App {
  constructor() {
    this.slides = [...document.querySelectorAll('.slide')];
    this.total = this.slides.length;
    this.current = 0;
    this.modules = {};
    this.indicator = document.getElementById('nav-indicator');
    this.progress = document.getElementById('nav-progress');
    this.prev = document.getElementById('nav-prev');
    this.next = document.getElementById('nav-next');
    this.prev.addEventListener('click', () => this.go(this.current - 1));
    this.next.addEventListener('click', () => this.go(this.current + 1));
    window.addEventListener('keydown', e => this.onKey(e));
    window.addEventListener('hashchange', () => this.fromHash());
    this.mount();
    this.fromHash(true);
    this.boot();
  }

  mount() {
    mountCover(document.getElementById('cover-art'));
    mountSpaceCounter();
    // Modules keyed by slide number; each may expose enter()/leave().
    this.modules[2] = mountProblem(document.getElementById('story-problem'));
    this.modules[3] = mountLandscape(document.getElementById('story-landscape'));
    this.modules[4] = mountImmune(document.getElementById('story-immune'));
    this.modules[5] = mountCsaFlow();
    this.modules[6] = mountJazz(document.getElementById('story-jazz'));
    this.modules[7] = mountPhsFlow();
    this.modules[8] = new Lab(document.getElementById('lab'));
    this.results = new Results();
  }

  async boot() {
    const live = await Api.detectBackend();
    const badge = document.getElementById('mode-badge');
    badge.textContent = live ? '● Backend CloudSim live' : '○ Snapshot CloudSim';
    badge.classList.toggle('is-live', live);
    badge.title = live
      ? 'Backend Java terhubung: simulasi CloudSim bisa dijalankan dari slide 9.'
      : 'Mode statis (GitHub Pages): algoritma tetap live di browser, hasil CloudSim dari snapshot run nyata.';
    await this.results.init();
    if (this.current === 7) this.modules[8].enter();
  }

  onKey(e) {
    const tag = document.activeElement?.tagName;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); this.go(this.current + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); this.go(this.current - 1); }
    else if (e.key === 'Home') { e.preventDefault(); this.go(0); }
    else if (e.key === 'End') { e.preventDefault(); this.go(this.total - 1); }
  }

  fromHash(initial = false) {
    const m = location.hash.match(/^#slide-(\d+)$/);
    const i = m ? Math.min(this.total, Math.max(1, +m[1])) - 1 : 0;
    if (initial || i !== this.current) this.go(i, false, initial);
  }

  go(i, updateHash = true, force = false) {
    i = Math.max(0, Math.min(this.total - 1, i));
    if (i === this.current && !force) return;
    this.modules[this.current + 1]?.leave?.();
    this.slides.forEach((s, k) => s.classList.toggle('active', k === i));
    this.current = i;
    this.indicator.textContent = `${i + 1} / ${this.total}`;
    this.progress.style.width = `${((i + 1) / this.total) * 100}%`;
    this.prev.disabled = i === 0;
    this.next.disabled = i === this.total - 1;
    document.title = `${this.slides[i].dataset.title} · CSA & PHS Scheduling`;
    if (updateHash) history.replaceState(null, '', `#slide-${i + 1}`);
    window.scrollTo(0, 0);
    // Let layout settle before animating (FLIP needs real rects).
    requestAnimationFrame(() => this.modules[i + 1]?.enter?.());
    if (i === 8) requestAnimationFrame(() => this.results.result && this.results.renderCase());
  }
}

window.app = new App();
