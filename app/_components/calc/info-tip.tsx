'use client';

import { useId, useState } from 'react';

/**
 * A small "i" that explains a field in plain words. Tap it (or press Enter or Space) to open the note right under the
 * label; tap again to close. The note sits in the page flow rather than floating, so it can never be cut off on a phone.
 */
export function useInfo(text?: string) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const button = text ? (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={id}
      aria-label="What does this mean?"
      onClick={() => setOpen((o) => !o)}
      className={`relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold italic leading-none transition-colors after:absolute after:-inset-3 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
        open ? 'border-activebg bg-activebg text-activetext' : 'border-muted text-muted hover:border-ink hover:text-ink'
      }`}
    >
      i
    </button>
  ) : null;
  const note =
    text && open ? (
      <p id={id} role="note" data-testid="info-note" className="mt-2 rounded-xl bg-wash px-3 py-2 text-xs leading-relaxed text-strong">
        {text}
      </p>
    ) : null;
  return { button, note };
}

/** A heading with an optional "i", for groups of choices that have no slider. */
export function InfoHeading({ children, info }: { children: React.ReactNode; info?: string }) {
  const { button, note } = useInfo(info);
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span>{children}</span>
        {button}
      </div>
      {note}
    </div>
  );
}
