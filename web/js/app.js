import { Api } from './api.js';
import { ScenarioFormManager } from './scenario-form.js';
import { Visualizer } from './visualizer.js';
import { EvaluationManager } from './evaluation.js';

class App {
  constructor() {
    this.currentSlide = 1;
    this.totalSlides = 5;

    this.initNavigation();
    this.initComponents();
  }

  initNavigation() {
    this.slideIndicator = document.getElementById('nav-slide-indicator');
    this.prevBtn = document.getElementById('nav-prev-btn');
    this.nextBtn = document.getElementById('nav-next-btn');

    if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.goToSlide(this.currentSlide - 1));
    if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.goToSlide(this.currentSlide + 1));

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA')) {
        return; // Don't steal keyboard when user is typing in forms
      }

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        this.goToSlide(this.currentSlide + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        this.goToSlide(this.currentSlide - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        this.goToSlide(1);
      } else if (e.key === 'End') {
        e.preventDefault();
        this.goToSlide(this.totalSlides);
      }
    });

    // Hash navigation
    window.addEventListener('popstate', () => this.syncHash());
    window.addEventListener('hashchange', () => this.syncHash());
    this.syncHash();
  }

  syncHash() {
    const hash = window.location.hash;
    const match = hash.match(/#slide-(\d+)/);
    if (match) {
      const num = parseInt(match[1]);
      if (num >= 1 && num <= this.totalSlides && num !== this.currentSlide) {
        this.goToSlide(num, false);
      }
    } else if (this.currentSlide !== 1) {
      this.goToSlide(1, false);
    }
  }

  goToSlide(num, updateHash = true) {
    if (num < 1) num = 1;
    if (num > this.totalSlides) num = this.totalSlides;
    if (this.currentSlide === num && document.getElementById(`slide-${num}`)?.classList.contains('active')) {
      return;
    }
    const previousSlide = this.currentSlide;
    this.currentSlide = num;

    document.querySelectorAll('.slide-section').forEach(s => {
      if (s.id !== `slide-${num}`) s.classList.remove('active');
    });
    const target = document.getElementById(`slide-${num}`);
    if (target) target.classList.add('active');

    if (this.slideIndicator) {
      this.slideIndicator.textContent = `${num} / ${this.totalSlides}`;
    }

    if (this.prevBtn) this.prevBtn.disabled = (num === 1);
    if (this.nextBtn) this.nextBtn.disabled = (num === this.totalSlides);

    if (num !== 4) this.visualizer?.pause();
    if (num === 5 && previousSlide !== 5) this.evaluationManager?.loadInitialData();

    if (updateHash && window.location.hash !== `#slide-${num}`) {
      history.replaceState(null, '', `#slide-${num}`);
    }

    // Instant scroll to top to avoid smooth-scroll fighting with slide display
    window.scrollTo(0, 0);
  }

  async initComponents() {
    this.formManager = new ScenarioFormManager();
    this.visualizer = new Visualizer(this.formManager);
    this.evaluationManager = new EvaluationManager(this.formManager);
    this.visualizer.runBackendSimulation = () => this.evaluationManager.runEvaluation();
    this.evaluationManager.onResult = result => this.visualizer.renderBackendResult(result);
    this.evaluationManager.onProgress = text => {
      this.visualizer.backendResultArea.textContent = text;
    };
    this.evaluationManager.onError = message => {
      this.visualizer.backendResultArea.textContent = `Eksperimen gagal: ${message}. Hasil sebelumnya di slide 5 tidak diganti.`;
    };
    this.formManager.onChangeCallback = () => {
      this.evaluationManager.markStale();
      this.visualizer.invalidate();
    };

    // Register form on slide 4
    this.formManager.registerForm('slide-4-form-container');

    // Slide 3 tab switching
    document.querySelectorAll('.theory-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.theory-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.theory-tab-content').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        const targetId = e.target.dataset.target;
        const targetEl = document.getElementById(targetId);
        if (targetEl) targetEl.classList.add('active');
      });
    });

    // Fetch datasets list and load sample tasks
    try {
      const data = await Api.fetchDatasets();
      this.formManager.setDatasets(data.datasets);
      await this.visualizer.loadSampleData();
    } catch (e) {
      this.visualizer.statusMsg.textContent = `Dataset tidak dapat dimuat: ${e.message}. Demo tidak memakai data pengganti.`;
    }

    // Default only when evaluation is first opened; never race a custom experiment.
    if (this.currentSlide === 5) this.evaluationManager.loadInitialData();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
