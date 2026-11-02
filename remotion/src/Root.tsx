import React from 'react';
import { Composition, Folder } from 'remotion';
import './studio-tokens.css';
import { FPS, REGISTRY } from './registry';
import { sampleCsa, samplePhs } from './sample';

const DEFAULTS: Record<string, Record<string, unknown>> = { 'csa-run': sampleCsa, 'phs-run': samplePhs };
const GROUPS: Record<string, string[]> = {
  Lab: ['csa-run', 'phs-run'],
  Flows: ['csa-flow', 'phs-flow'],
  Stories: ['problem', 'landscape', 'immune', 'jazz']
};

export const RemotionRoot: React.FC = () => (
  <>
    {Object.entries(GROUPS).map(([name, ids]) => (
      <Folder key={name} name={name}>
        {ids.map(id => {
          const e = REGISTRY[id];
          const props = DEFAULTS[id] ?? {};
          return (
            <Composition key={id} id={id} component={e.component} defaultProps={props} fps={FPS}
              width={e.width} height={e.height} durationInFrames={e.timeline(props).total}
              calculateMetadata={({ props: p }) => ({ durationInFrames: e.timeline(p).total })} />
          );
        })}
      </Folder>
    ))}
  </>
);
