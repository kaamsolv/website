'use client';

import { forwardRef } from 'react';

/**
 * Fields that sit *on* the invoice paper. The paper is always white (it
 * previews printed paper, in both themes), so these use fixed paper colours,
 * not theme tokens. A dashed underline always shows what's editable; focus
 * turns it solid coral with a ring. Placeholder #5B6478 on white ≈ 5.9 : 1.
 */
export const PAPER_TEXT = 'text-[#0C2248]';
export const PAPER_MUTED = 'text-[#5B6478]';
const FIELD =
  'block w-full min-h-11 md:min-h-8 rounded-sm bg-transparent px-1.5 py-1 text-[#0C2248] placeholder:text-[#5B6478] ' +
  'border-0 border-b border-dashed border-[#AEB6C6] hover:border-[#5B6478] transition-colors ' +
  'focus:outline-none focus:border-solid focus:border-[#FE6336] focus-visible:ring-2 focus-visible:ring-[#FE6336]/40 ' +
  'aria-[invalid=true]:border-solid aria-[invalid=true]:border-[#B42318]';

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string };

export const PaperInput = forwardRef<HTMLInputElement, InputProps>(function PaperInput(
  { label, className = '', ...rest },
  ref,
) {
  return <input ref={ref} aria-label={label} className={`${FIELD} ${className}`} {...rest} />;
});

type AreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string };

export function PaperTextarea({ label, className = '', rows = 2, ...rest }: AreaProps) {
  return <textarea aria-label={label} rows={rows} className={`${FIELD} resize-none leading-snug ${className}`} {...rest} />;
}

/** Small caption above a field, e.g. "Invoice no." — visible, and the field's label. */
export function PaperCaption({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className={`block text-[11px] font-semibold uppercase tracking-wide ${PAPER_MUTED}`}>
      {children}
    </label>
  );
}
