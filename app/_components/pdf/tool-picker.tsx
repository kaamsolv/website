'use client';

import { useState } from 'react';
import { Icon } from '../icons';
import { LIVE_TOOLS, PDF_SECTIONS, type PdfSectionId, type PdfTask } from '@/app/lib/pdf/tools';

type TaskId = Exclude<PdfTask, 'hub'>;

/**
 * "What do you want to do?" inside the workspace: a few groups (Organize, Compress, Convert…),
 * then the tools of the open group. Only tools that work are listed. The groups are a radio
 * group and so are the tools, so a keyboard or screen reader can use both with the arrow keys.
 */
export function ToolPicker({ value, onChange, disabled }: { value: TaskId; onChange: (task: TaskId) => void; disabled?: boolean }) {
  const current = LIVE_TOOLS.find((t) => t.task === value)!.section;
  const [picked, setPicked] = useState<PdfSectionId | null>(null);
  // Follow the active tool when it changes elsewhere (the hub, a dropped photo), unless the person just opened another group.
  const open = picked && picked !== current && LIVE_TOOLS.some((t) => t.section === picked) ? picked : current;
  const sections = PDF_SECTIONS.filter((s) => LIVE_TOOLS.some((t) => t.section === s.id));
  const tools = LIVE_TOOLS.filter((t) => t.section === open);

  return (
    <div className="space-y-3">
      <fieldset disabled={disabled}>
        <legend className="mb-2 text-sm font-semibold text-ink">What do you want to do?</legend>
        <div className="flex flex-wrap gap-2" role="presentation">
          {sections.map((s) => {
            const on = open === s.id;
            return (
              <label key={s.id} className="relative">
                <input type="radio" name="pdf-group" value={s.id} checked={on} onChange={() => setPicked(s.id)} className="peer sr-only" />
                <span
                  className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-coral-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas peer-disabled:cursor-not-allowed peer-disabled:opacity-60 ${
                    on ? 'border-activebg bg-activebg text-activetext' : 'border-hair bg-surface text-strong hover:border-muted'
                  }`}
                >
                  {on && <Icon name="check" className="-ml-0.5 h-4 w-4" />}
                  {s.short}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend className="sr-only">{PDF_SECTIONS.find((s) => s.id === open)?.title}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tools.map((t) => {
            const on = value === t.task;
            return (
              <label key={t.task} className="relative">
                <input type="radio" name="pdf-action" value={t.task} checked={on} onChange={() => onChange(t.task)} className="peer sr-only" />
                <span
                  className={`flex min-h-14 cursor-pointer flex-col justify-center rounded-xl border px-4 py-2.5 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-coral-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas peer-disabled:cursor-not-allowed peer-disabled:opacity-60 ${
                    on ? 'border-activebg bg-activebg text-activetext shadow-soft' : 'border-hair bg-surface text-ink hover:border-muted'
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-display text-sm font-bold">
                    {on && <Icon name="check" className="-ml-0.5 h-4 w-4" />}
                    {t.label}
                  </span>
                  <span className={`text-xs ${on ? 'opacity-80' : 'text-muted'}`}>{t.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
