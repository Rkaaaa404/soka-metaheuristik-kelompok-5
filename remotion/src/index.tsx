import React, { useState, useImperativeHandle, forwardRef, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Player, type PlayerRef } from '@remotion/player';
import { FPS, REGISTRY } from './registry';
import { settledFrame, stepAt, type Timeline } from './timing';
import { R as P_RANDOM, S as P_SMART } from './compositions/stories/Problem';

/**
 * Bridge between the plain-JS slide deck and Remotion's <Player>.
 * Each mount renders one composition into `el` and returns an imperative
 * handle: the deck keeps its own buttons / captions and drives the player.
 */
type Opts = { loop?: boolean; autoPlay?: boolean };
type HostState = { id: string; props: Record<string, unknown>; rate: number; loop: boolean };
type HostApi = { player: () => PlayerRef | null; set: (s: Partial<HostState>) => void };

const Host = forwardRef<HostApi, { initial: HostState }>(({ initial }, ref) => {
  const [st, setSt] = useState(initial);
  const player = useRef<PlayerRef>(null);
  useImperativeHandle(ref, () => ({ player: () => player.current, set: s => setSt(o => ({ ...o, ...s })) }), []);
  const e = REGISTRY[st.id];
  const tl = e.timeline(st.props);
  return (
    <Player
      // a different composition needs a fresh Player (it caches the component)
      key={st.id}
      ref={player}
      component={e.component}
      inputProps={st.props}
      durationInFrames={tl.total}
      compositionWidth={e.width}
      compositionHeight={e.height}
      fps={FPS}
      controls={false}
      loop={st.loop}
      playbackRate={st.rate}
      clickToPlay={false}
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
      moveToBeginningWhenEnded={st.loop}
      numberOfSharedAudioTags={0}
      initiallyMuted
      acknowledgeRemotionLicense
      style={{ width: '100%', aspectRatio: `${e.width} / ${e.height}`, display: 'block' }}
    />
  );
});

type Listener = (...a: any[]) => void;

export function mountPlayer(el: HTMLElement, id: string, props: Record<string, unknown> = {}, opts: Opts = {}) {
  if (!REGISTRY[id]) throw new Error(`Unknown composition ${id}`);
  const root = createRoot(el);
  const host = React.createRef<HostApi>();
  let state: HostState = { id, props, rate: 1, loop: !!opts.loop };
  flushSync(() => root.render(<Host ref={host} initial={state} />));

  const listeners = new Map<string, Set<Listener>>();
  const emit = (name: string, ...a: unknown[]) => listeners.get(name)?.forEach(fn => fn(...a));
  let timeline: Timeline = REGISTRY[id].timeline(props);
  let lastStep = -1;
  let stopAt: number | null = null;
  const p = () => host.current!.player()!;

  const onFrame = (frame: number) => {
    if (stopAt !== null && frame >= stopAt) {
      const f = stopAt;
      stopAt = null;
      p().pause();
      p().seekTo(f);
      frame = f;
    }
    const s = stepAt(timeline, frame);
    emit('frame', frame);
    if (s !== lastStep) { lastStep = s; emit('step', s); }
  };
  const attach = () => {
    const pl = p();
    pl.addEventListener('frameupdate', e => onFrame(e.detail.frame));
    pl.addEventListener('seeked', e => onFrame(e.detail.frame));
    pl.addEventListener('play', () => emit('play'));
    pl.addEventListener('pause', () => emit('pause'));
    pl.addEventListener('ended', () => emit('ended'));
  };
  attach();

  const api = {
    get timeline() { return timeline; },
    get frame() { return p().getCurrentFrame(); },
    get step() { return stepAt(timeline, p().getCurrentFrame()); },
    isPlaying: () => p().isPlaying(),
    play() { stopAt = null; p().play(); },
    pause() { stopAt = null; p().pause(); },
    seekTo(frame: number) { stopAt = null; p().seekTo(Math.max(0, Math.min(timeline.total - 1, frame))); },
    /** Jump to step i. animate → play its transition and hold at its end; else show the settled state. */
    seekStep(i: number, { animate = true }: { animate?: boolean } = {}) {
      i = Math.max(0, Math.min(timeline.starts.length - 1, i));
      if (animate) {
        p().seekTo(timeline.starts[i]);
        stopAt = settledFrame(timeline, i);
        p().play();
      } else {
        stopAt = null;
        p().pause();
        p().seekTo(settledFrame(timeline, i));
      }
    },
    setRate(rate: number) { state = { ...state, rate }; flushSync(() => host.current!.set({ rate })); },
    setLoop(loop: boolean) { state = { ...state, loop }; flushSync(() => host.current!.set({ loop })); },
    /** New input props (e.g. Lab parameters changed) and optionally another composition. */
    update(next: Record<string, unknown>, nextId = state.id) {
      stopAt = null;
      const remount = nextId !== state.id;
      state = { ...state, id: nextId, props: next };
      timeline = REGISTRY[nextId].timeline(next);
      lastStep = -1;
      p().pause();
      flushSync(() => host.current!.set({ id: nextId, props: next }));
      if (remount) { attach(); emit('pause'); }
      p().seekTo(0);
    },
    on(name: 'frame' | 'step' | 'play' | 'pause' | 'ended', fn: Listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(fn);
      return api;
    },
    destroy() { root.unmount(); listeners.clear(); }
  };
  return api;
}

export { stepAt, settledFrame } from './timing';
export type PlayerHandle = ReturnType<typeof mountPlayer>;

/** Numbers the slide-2 captions quote, from the same layouts the composition draws. */
export const problemStats = { random: P_RANDOM.makespan, smart: P_SMART.makespan };
