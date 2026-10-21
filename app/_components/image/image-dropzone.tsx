'use client';

import { useCallback, useRef, useState } from 'react';

type Props = {
  accept: string;
  extensions: readonly string[];
  disabled?: boolean;
  onFile: (file: File) => void;
};

export function ImageDropzone({ accept, extensions, disabled, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const pick = useCallback(
    (file: File | undefined) => {
      if (file && !disabled) onFile(file);
    },
    [disabled, onFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      pick(e.dataTransfer.files[0]);
    },
    [disabled, pick],
  );

  const extLabel = extensions.map((e) => e.toUpperCase()).join(', ');

  return (
    <div
      className={`dropzone rounded-xl2 border-2 border-dashed border-hair p-10 text-center transition-colors ${
        dragOver ? 'drag-over' : ''
      } ${disabled ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!disabled) inputRef.current?.click();
        }
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
    >
      <svg
        className="mx-auto mb-3 h-10 w-10 text-faint"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path d="M12 16V4M8 8l4-4 4 4" />
        <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
      </svg>
      <p className="font-display font-bold text-ink">Drop your image here</p>
      <p className="mt-1 text-sm text-muted">
        or{' '}
        <span className="font-semibold text-coral-600 underline">browse your device</span>
      </p>
      <p className="mt-2 text-xs text-faint">{extLabel} · up to 25 MB</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
