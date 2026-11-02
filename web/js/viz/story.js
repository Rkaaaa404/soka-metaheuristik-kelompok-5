import { mountPlayer } from '../remotion/bundle.js';
import { reducedMotion } from './util.js';

/**
 * Storyboard controller around a Remotion composition. The composition owns
 * the animation (one scene per step); this class owns the step buttons,
 * caption and mapping rows and keeps them in sync with the player.
 */
export class Story {
  constructor(root, { steps, composition, onStep, mapping = null }) {
    this.root = root;
    this.steps = steps;
    this.onStep = onStep;
    this.mapping = mapping;
    this.step = -1;
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

    this.player = mountPlayer(this.stage, composition, {}, { loop: true })
      .on('step', i => this.sync(i))
      .on('play', () => this.setPlaying(true))
      .on('pause', () => this.setPlaying(false));

    root.querySelector('[data-act="prev"]').addEventListener('click', () => this.go(this.step - 1));
    root.querySelector('[data-act="next"]').addEventListener('click', () => this.go(this.step + 1));
    this.playBtn.addEventListener('click', () => (this.player.isPlaying() ? this.player.pause() : this.player.play()));
    root.querySelectorAll('.story-steps button').forEach(b => b.addEventListener('click', () => this.go(+b.dataset.i)));
    mapping?.querySelectorAll('.map-row').forEach(row => row.addEventListener('click', () => this.go(+row.dataset.step - 1)));
    this.sync(0);
  }

  /** Jump to a step: plays that step's scene once and holds on it. */
  go(i) {
    const n = this.steps.length;
    this.player.seekStep(((i % n) + n) % n, { animate: !reducedMotion() });
  }

  sync(i) {
    if (i === this.step) return;
    this.step = i;
    const s = i + 1;
    this.root.querySelectorAll('.story-steps button').forEach((b, k) => {
      if (k === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    this.caption.innerHTML = this.steps[i].caption;
    this.mapping?.querySelectorAll('.map-row').forEach(r => r.classList.toggle('on', +r.dataset.step === s));
    this.onStep?.(s);
  }

  setPlaying(on) {
    this.playBtn.textContent = on ? '❚❚' : '▶';
    this.playBtn.setAttribute('aria-label', on ? 'Jeda' : 'Putar otomatis');
  }

  /** Called by the app when the slide becomes active / inactive. */
  enter() {
    if (reducedMotion()) { this.player.seekStep(0, { animate: false }); return; }
    this.player.seekTo(0);
    this.player.play();
  }
  leave() { this.player.pause(); }
}
