import React from 'react';
import { Mulberry32 } from '../../../../web/js/algorithms/rng.js';
import { mix, prog } from '../../anim';
import { SvgStage, storyTimeline, txt, useStory } from './common';

/* Slide 6: jazz polyrhythm → PHS. */
export const JAZZ_W = 1280, JAZZ_H = 600;
export const jazzTimeline = () => storyTimeline(5, 140);

const melody = (seed: number, n = 8): number[] => { const r = new Mulberry32(seed); return Array.from({ length: n }, () => r.nextInt(4)); };
const BAR = 72; // one 3:4 cycle = 2.4 s

const Sheet: React.FC<{ x: number; y: number; notes: number[]; label: string; stroke?: string; sw?: number; opacity?: number }> =
  ({ x, y, notes, label, stroke = 'var(--border-strong)', sw = 1, opacity = 1 }) => (
    <g transform={`translate(${x} ${y})`} opacity={opacity}>
      <rect width={150} height={34} rx={6} fill="var(--surface)" stroke={stroke} strokeWidth={sw} />
      {notes.map((v, i) => <rect key={i} x={8 + i * 13} y={9} width={11} height={16} rx={2} fill={`var(--c${v})`} />)}
      <text x={8 + notes.length * 13 + 4} y={22} style={txt.sub}>{label}</text>
    </g>
  );

const Caps: React.FC<{ x: number; y: number; c: number[]; stroke?: string; sw?: number; opacity?: number }> = ({ x, y, c, stroke = 'var(--border-strong)', sw = 1, opacity = 1 }) => (
  <g transform={`translate(${x} ${y})`} opacity={opacity}>
    <rect width={150} height={34} rx={6} fill="var(--surface)" stroke={stroke} strokeWidth={sw} />
    {c.map((v, i) => <rect key={i} x={8 + i * 18} y={27 - v * 18} width={14} height={Math.max(2, v * 18)} rx={2} fill={`var(--c${i})`} />)}
  </g>
);

export const Jazz: React.FC = () => {
  const { step, local, frame, reached } = useStory(jazzTimeline());
  const r2 = reached(2), r3 = reached(3), r4 = reached(4, 10, 60), r5 = reached(5);
  const appear = (i: number) => (step === 1 ? prog(local, i * 6, i * 6 + 20) : 1);
  const sway = step === 2 ? Math.sin(local * 0.26) * 10 : 0;
  const beat = (n: number, i: number) => {
    const ph = (frame % BAR) - (i * BAR) / n;
    return ph >= 0 && ph < 14 ? 1 - ph / 14 : 0;
  };
  const beats = (y: number, n: number, color: string) => Array.from({ length: n }, (_, i) => {
    const b = r3 > 0.5 ? beat(n, i) : 0;
    return <circle key={i} cx={170 + (i + 0.5) * (300 / n)} cy={y} r={9 * (1 + 0.5 * b)} fill={b > 0 ? color : 'var(--border-strong)'} />;
  });
  // probe: drops from the musician (step 2), slides into the worst slot (step 4)
  const px = mix(245, 20, r4), py = mix(136, 114, r4) + mix(-24, 0, r2);
  const verdictOp = r4 * (1 - r5);

  return (
    <SvgStage w={640} h={300}>
      <text x={20} y={22} style={txt.lbl}>HM · Jadwal</text>
      <text x={470} y={22} style={txt.lbl}>HM · Resource</text>
      <Sheet x={20} y={34} notes={melody(1)} label="312 s" opacity={appear(0)} stroke={r5 > 0 ? 'var(--phs)' : undefined} sw={mix(1, 2.5, r5)} />
      <Sheet x={20} y={74} notes={melody(2)} label="298 s" opacity={appear(1)} />
      <Sheet x={20} y={114} notes={melody(3)} label="355 s" opacity={appear(2) * (1 - r4)} stroke={r4 > 0 ? 'var(--error)' : undefined} sw={r4 > 0 ? 2 : 1} />
      <Caps x={470} y={34} c={[1, 0.5, 1, 0, 1]} opacity={appear(3)} />
      <Caps x={470} y={74} c={[1, 1, 0.5, 0.5, 0]} opacity={appear(4)} stroke={r5 > 0 ? 'var(--phs)' : undefined} sw={mix(1, 2.5, r5)} />
      <Caps x={470} y={114} c={[0, 1, 1, 0.5, 1]} opacity={appear(5)} />

      <g transform="translate(320 88)">
        <circle r={34} fill="var(--phs-soft)" stroke="var(--phs)" strokeWidth={2} />
        <text y={12} textAnchor="middle" fontSize={32} transform={`rotate(${sway})`}>🎷</text>
      </g>
      <g opacity={r2}>
        <Sheet x={px} y={py} notes={[0, 3, 3, 1, 2, 2, 1, 0]} label="probe" stroke={r4 > 0 ? 'var(--success)' : undefined} sw={r4 > 0 ? 2 : 1} />
      </g>
      <path d="M290,130 V176 M342,130 V176" stroke="var(--phs)" strokeWidth={2} strokeDasharray="3 3" opacity={step === 2 ? prog(local, 30, 45) : 0} />
      <text x={320} y={196} textAnchor="middle" style={{ ...txt.lbl, fill: 'var(--success)' }} opacity={verdictOp}>286 s &lt; 355 s → ganti terburuk ✓</text>

      <g opacity={mix(0.25, 1, r3)}>
        <text x={160} y={232} textAnchor="end" style={txt.sub}>ritme jadwal · 4</text>
        <text x={160} y={272} textAnchor="end" style={txt.sub}>ritme resource · 3</text>
        <line x1={170} x2={470} y1={232} y2={232} stroke="var(--border)" />
        <line x1={170} x2={470} y1={272} y2={272} stroke="var(--border)" />
        {beats(232, 4, 'var(--c0)')}{beats(272, 3, 'var(--phs)')}
      </g>

      <g transform={`translate(470 ${mix(216, 196, r5)})`} opacity={r5}>
        <rect width={150} height={64} rx={10} fill="var(--phs)" />
        <text x={75} y={28} textAnchor="middle" style={{ ...txt.lbl, fill: '#fff' }}>🎼 harmoni terbaik</text>
        <text x={75} y={46} textAnchor="middle" style={{ ...txt.sub, fill: '#fff' }}>jadwal + VM aktif</text>
      </g>
    </SvgStage>
  );
};
