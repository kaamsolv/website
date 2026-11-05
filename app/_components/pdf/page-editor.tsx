'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { PdfThumb } from './pdf-thumb';
import { LINK, PRIMARY, SECONDARY } from './pdf-styles';
import { describeEdit, editReducer, initEdit, isEdited, toPlan } from '@/app/lib/pdf/page-edit';
import type { PagePlan } from '@/app/lib/pdf/organize';
import type { PDFDocumentProxy } from '@/app/lib/pdf/pdfjs';
import { pagesLabel } from '@/app/lib/pdf/order';

export type EditorFocus = 'rotate' | 'delete' | 'rearrange';

type Confirm = { kind: 'delete'; srcs: number[] } | { kind: 'keep' } | { kind: 'reset' } | null;

const INTRO: Record<EditorFocus, string> = {
  rotate: 'Turn single pages, or tick several and turn them together. Nothing is saved until you press the button at the bottom.',
  delete: 'Tick the pages you don’t need and delete them, or use the ✕ on a page. Nothing is saved until you press the button at the bottom.',
  rearrange: 'Drag pages into a new order, or use the arrow buttons under each page. Nothing is saved until you press the button at the bottom.',
};

const ICON_BTN =
  'grid h-11 min-w-11 shrink-0 place-items-center rounded-full border border-hair bg-surface px-2 text-base text-strong hover:bg-wash disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';

/**
 * Rotate, delete, rearrange and "keep only these" on one page grid. The rules live in
 * app/lib/pdf/page-edit.ts (reducer, unit-tested); this draws them. All the changes are
 * made on a list in memory — the PDF is only built when the person presses Save.
 */
export function PageEditor({
  fileName,
  pages,
  doc,
  focus,
  disabled,
  onSave,
  onDirtyChange,
}: {
  fileName: string;
  pages: number;
  doc: Promise<PDFDocumentProxy>;
  focus: EditorFocus;
  disabled: boolean;
  onSave: (plan: PagePlan[], summary: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [state, dispatch] = useReducer(editReducer, pages, initEdit);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const refocus = useRef<{ src: number; control: string } | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  const edited = isEdited(state);
  const selectedCount = state.selected.length;
  const total = state.pages.length;
  const everyone = selectedCount === 0 ? state.pages.map((p) => p.src) : state.selected;
  const targetLabel = selectedCount === 0 ? `all ${total} ${total === 1 ? 'page' : 'pages'}` : `${selectedCount} selected`;
  const canDelete = selectedCount > 0 && selectedCount < total;
  const canKeep = selectedCount > 0 && selectedCount < total;

  useEffect(() => onDirtyChange?.(edited), [state, edited, onDirtyChange]);
  // Put keyboard focus back on the control that was used (the page it belongs to may have moved).
  useEffect(() => {
    const target = refocus.current;
    if (!target) return;
    refocus.current = null;
    document.querySelector<HTMLElement>(`[data-page="${target.src}"] [data-control="${target.control}"]`)?.focus();
  });
  useEffect(() => {
    if (confirm) confirmRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, [confirm]);

  const say = (text: string) => setMessage(text);

  function rotate(srcs: number[], by: 90 | 270, control?: string) {
    dispatch({ type: 'rotate', srcs, by });
    if (control && srcs.length === 1) refocus.current = { src: srcs[0], control };
    say(`${srcs.length === 1 ? `Page ${srcs[0] + 1}` : `${srcs.length} pages`} turned ${by === 90 ? 'right' : 'left'}.`);
  }
  function move(position: number, to: number, control: string) {
    const page = state.pages[position];
    dispatch({ type: 'move', from: position, to });
    refocus.current = { src: page.src, control };
    say(`Page ${page.src + 1} is now number ${to + 1} of ${total}.`);
  }
  function applyConfirm() {
    if (!confirm) return;
    if (confirm.kind === 'delete') {
      dispatch({ type: 'delete', srcs: confirm.srcs });
      say(`${pagesLabel(confirm.srcs.length)} deleted. Undo is available.`);
    } else if (confirm.kind === 'keep') {
      dispatch({ type: 'keepOnly', srcs: state.selected });
      say(`Kept ${pagesLabel(selectedCount)}. The rest were removed. Undo is available.`);
    } else {
      dispatch({ type: 'reset' });
      say('Back to the original.');
    }
    setConfirm(null);
  }
  const confirmText =
    confirm?.kind === 'delete'
      ? `Delete ${pagesLabel(confirm.srcs.length)}? They won’t be in the new PDF. You can still undo.`
      : confirm?.kind === 'keep'
        ? `Keep only the ${pagesLabel(selectedCount)} you ticked and remove the other ${total - selectedCount}? You can still undo.`
        : 'Go back to the original pages? Your changes will be cleared, and you can still undo.';
  const confirmYes = confirm?.kind === 'delete' ? 'Delete' : confirm?.kind === 'keep' ? 'Keep only these' : 'Reset';

  return (
    <div className="space-y-4" data-testid="page-editor">
      <p className="text-sm text-muted">{INTRO[focus]}</p>

      <div className="space-y-3 rounded-xl border border-hair bg-surface p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button type="button" className={LINK} onClick={() => dispatch({ type: 'selectAll' })} disabled={disabled || selectedCount === total}>
            Select all
          </button>
          <button type="button" className={LINK} onClick={() => dispatch({ type: 'clearSelection' })} disabled={disabled || selectedCount === 0}>
            Clear selection
          </button>
          <p className="text-sm text-muted" data-testid="selected-count">
            {selectedCount === 0 ? 'Nothing ticked yet. Tick pages to turn, delete or keep them together.' : `${selectedCount} of ${total} ticked`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={SECONDARY} disabled={disabled} onClick={() => rotate(everyone, 270)} aria-label={`Rotate ${targetLabel} left`}>
            <span aria-hidden="true" className="mr-1.5">↺</span>Rotate left
          </button>
          <button type="button" className={SECONDARY} disabled={disabled} onClick={() => rotate(everyone, 90)} aria-label={`Rotate ${targetLabel} right`}>
            <span aria-hidden="true" className="mr-1.5">↻</span>Rotate right
          </button>
          <button type="button" className={SECONDARY} disabled={disabled || !canDelete} onClick={() => setConfirm({ kind: 'delete', srcs: state.selected })}>
            Delete {canDelete ? pagesLabel(selectedCount) : 'ticked pages'}
          </button>
          <button type="button" className={SECONDARY} disabled={disabled || !canKeep} onClick={() => setConfirm({ kind: 'keep' })}>
            Keep only ticked
          </button>
          <button type="button" className={SECONDARY} disabled={disabled || state.past.length === 0} onClick={() => (dispatch({ type: 'undo' }), say('Undone.'))}>
            Undo
          </button>
          <button type="button" className={SECONDARY} disabled={disabled || !edited} onClick={() => setConfirm({ kind: 'reset' })}>
            Reset
          </button>
        </div>
        <p className="text-xs text-muted">Rotate acts on {targetLabel}.{total === 1 ? ' This PDF has one page, so it can’t be deleted.' : ''}</p>
      </div>

      {confirm && (
        <div ref={confirmRef} role="group" aria-label="Please confirm" className="rounded-xl border border-hair bg-wash p-4" data-testid="editor-confirm">
          <p className="text-sm font-semibold text-ink">{confirmText}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className={`${PRIMARY} !w-auto`} onClick={applyConfirm} data-testid="editor-confirm-yes">
              {confirmYes}
            </button>
            <button type="button" className={SECONDARY} onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" aria-label={`Pages of ${fileName}`}>
        {state.pages.map((p, position) => {
          const on = state.selected.includes(p.src);
          const moved = p.src !== position;
          return (
            <li
              key={p.src}
              data-page={p.src}
              draggable={!disabled}
              onDragStart={(e) => {
                setDragging(position);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(position));
              }}
              onDragOver={(e) => {
                if (dragging === null) return;
                e.preventDefault();
                setOver(position);
              }}
              onDragLeave={() => setOver((o) => (o === position ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging !== null && dragging !== position) {
                  const page = state.pages[dragging];
                  dispatch({ type: 'move', from: dragging, to: position });
                  say(`Page ${page.src + 1} is now number ${position + 1} of ${total}.`);
                }
                setDragging(null);
                setOver(null);
              }}
              onDragEnd={() => (setDragging(null), setOver(null))}
              className={`rounded-xl border p-2 transition-colors sm:cursor-grab ${on ? 'border-coral-500 bg-coralx-100' : over === position && dragging !== position ? 'border-coral-500 bg-surface' : 'border-hair bg-surface'} ${dragging === position ? 'opacity-60' : ''}`}
            >
              <div className="relative aspect-square w-full">
                <div className="h-full w-full transition-transform duration-200 motion-reduce:transition-none" style={{ transform: `rotate(${p.rotate}deg)` }}>
                  <PdfThumb doc={doc} pageNumber={p.src + 1} alt={`Original page ${p.src + 1}${p.rotate ? `, turned ${p.rotate} degrees` : ''}`} className="h-full w-full" />
                </div>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={disabled}
                  onChange={() => dispatch({ type: 'toggle', src: p.src })}
                  className="absolute left-1 top-1 h-6 w-6 cursor-pointer accent-coral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2"
                  aria-label={`Tick page ${position + 1}${moved ? `, originally page ${p.src + 1}` : ''}`}
                  data-control="tick"
                />
              </div>
              <p className={`mt-1 text-center text-xs ${on ? 'font-semibold text-ink' : 'text-muted'}`}>
                Page {position + 1}
                {moved && <span className="text-faint"> (was {p.src + 1})</span>}
                {p.rotate !== 0 && <span className="text-faint"> · {p.rotate}°</span>}
              </p>
              <div className="mt-1 flex flex-wrap justify-center gap-1">
                <button type="button" className={ICON_BTN} disabled={disabled} data-control="left" onClick={() => rotate([p.src], 270, 'left')} aria-label={`Rotate page ${position + 1} left`}>
                  <span aria-hidden="true">↺</span>
                </button>
                <button type="button" className={ICON_BTN} disabled={disabled} data-control="right" onClick={() => rotate([p.src], 90, 'right')} aria-label={`Rotate page ${position + 1} right`}>
                  <span aria-hidden="true">↻</span>
                </button>
                <button type="button" className={ICON_BTN} disabled={disabled || total === 1} data-control="delete" onClick={() => setConfirm({ kind: 'delete', srcs: [p.src] })} aria-label={`Delete page ${position + 1}`}>
                  <span aria-hidden="true">✕</span>
                </button>
                <button type="button" className={ICON_BTN} disabled={disabled || position === 0} data-control="earlier" onClick={() => move(position, position - 1, 'earlier')} aria-label={`Move page ${position + 1} earlier`}>
                  <span aria-hidden="true">←</span>
                </button>
                <button type="button" className={ICON_BTN} disabled={disabled || position === total - 1} data-control="later" onClick={() => move(position, position + 1, 'later')} aria-label={`Move page ${position + 1} later`}>
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
      <p className="text-center text-sm text-muted" data-testid="edit-summary">
        {edited ? describeEdit(state) : 'No changes yet.'}
      </p>
      <div className="sticky bottom-3 z-10">
        <button type="button" className={`${PRIMARY} shadow-lift`} disabled={disabled || !edited} onClick={() => onSave(toPlan(state), describeEdit(state))} data-testid="editor-save">
          {edited ? `Save PDF (${pagesLabel(total)})` : 'Make a change, then save'}
        </button>
      </div>
    </div>
  );
}
