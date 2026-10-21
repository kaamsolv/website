'use client';

import type { ConvertProgress, ConvertStage } from '@/app/lib/image/types';
import { CONVERT_STAGES } from '@/app/lib/image/types';

const STAGE_LABELS: Record<ConvertStage, string> = {
  preparing: 'Preparing',
  reading: 'Reading image',
  decoding: 'Decoding',
  processing: 'Processing',
  encoding: 'Encoding',
  finalizing: 'Finalizing',
};

const VISIBLE_STAGES = CONVERT_STAGES.filter((s) => s !== 'preparing');

function stageIndex(stage: ConvertStage): number {
  return CONVERT_STAGES.indexOf(stage);
}

type Props = {
  progress: ConvertProgress;
};

export function ConversionProgress({ progress }: Props) {
  const currentIdx = stageIndex(progress.stage);
  const showBar = progress.percent != null && progress.stage === 'encoding';

  return (
    <div className="rounded-xl2 border border-hair bg-surface p-5" aria-live="polite">
      <p className="text-sm font-semibold text-ink">Converting your image</p>

      {progress.batch && (
        <p className="mt-1 text-xs text-muted">
          {progress.batch.current} / {progress.batch.total} images
        </p>
      )}

      {showBar && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs font-medium text-muted">
            <span>{STAGE_LABELS.encoding}</span>
            <span>{progress.percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-wash">
            <div
              className="h-full rounded-full bg-coral-500 transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {VISIBLE_STAGES.map((stage) => {
          const idx = stageIndex(stage);
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          return (
            <li key={stage} className="flex items-center gap-2 text-sm">
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  done
                    ? 'bg-tealx-100 text-tealx-600'
                    : active
                      ? 'bg-coralx-100 text-coral-600'
                      : 'bg-wash text-faint'
                }`}
                aria-hidden="true"
              >
                {done ? '✓' : active ? '→' : '○'}
              </span>
              <span className={active ? 'font-semibold text-ink' : done ? 'text-muted' : 'text-faint'}>
                {STAGE_LABELS[stage]}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
