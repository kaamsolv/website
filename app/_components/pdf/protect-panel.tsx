'use client';

import { useState } from 'react';
import { PRIMARY } from './pdf-styles';
import { MAX_PASSWORD_CHARS, MIN_PASSWORD_CHARS, checkPassword, passwordStrength, type ProtectOptions } from '@/app/lib/pdf/protect-rules';

const FIELD =
  'h-12 w-full rounded-xl border border-hair bg-surface px-3 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 sm:max-w-sm';
const STRENGTH = { short: 'Short. Longer is stronger.', ok: 'Fine. Longer or mixed characters are stronger.', strong: 'Strong.' } as const;

/**
 * Protect a PDF with a password. The one lock is the OPENING password; the permission switches are
 * requests that PDF apps are asked to follow, and the page says so in plain words. The password stays
 * in this tab: it is used to encrypt in the browser and is cleared when you press the button.
 */
export function ProtectPanel({ disabled, onApply }: { disabled: boolean; onApply: (options: ProtectOptions) => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [block, setBlock] = useState({ printing: false, copying: false, editing: false });

  const check = checkPassword(password, confirm);
  const mismatch = confirm !== '' && password !== confirm;
  const type = show ? 'text' : 'password';

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">Locks your PDF with a password. Without it, nobody can open the file. It happens on your device, so your PDF and your password are never uploaded.</p>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!check.ok || disabled) return;
          onApply({ password, block });
          setPassword('');
          setConfirm('');
          setShow(false);
        }}
      >
        <div>
          <label htmlFor="pw-open" className="block text-sm font-semibold text-ink">
            Password to open the PDF
          </label>
          <input
            id="pw-open"
            type={type}
            className={`${FIELD} mt-1`}
            value={password}
            autoComplete="new-password"
            spellCheck={false}
            maxLength={MAX_PASSWORD_CHARS + 20}
            disabled={disabled}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="pw-hint"
          />
          <p id="pw-hint" className="mt-1.5 text-sm text-muted">
            {password === '' ? `${MIN_PASSWORD_CHARS} to ${MAX_PASSWORD_CHARS} characters.` : password.length < MIN_PASSWORD_CHARS || password.length > MAX_PASSWORD_CHARS ? (check.ok ? '' : check.message) : STRENGTH[passwordStrength(password)]}
          </p>
        </div>
        <div>
          <label htmlFor="pw-confirm" className="block text-sm font-semibold text-ink">
            Type it again
          </label>
          <input
            id="pw-confirm"
            type={type}
            className={`${FIELD} mt-1`}
            value={confirm}
            autoComplete="new-password"
            spellCheck={false}
            maxLength={MAX_PASSWORD_CHARS + 20}
            disabled={disabled}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch ? true : undefined}
          />
          {mismatch && (
            <p role="alert" className="mt-1.5 text-sm text-danger-700">
              The two passwords don’t match.
            </p>
          )}
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
          <input type="checkbox" className="h-5 w-5 accent-coral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Show the password
        </label>

        <p className="rounded-xl border border-hair bg-surface px-4 py-3 text-sm text-strong" data-testid="protect-warning">
          <strong className="text-ink">Keep this password safe.</strong> We can’t see it or recover it. If it’s lost, the PDF can’t be opened.
        </p>

        <details className="rounded-xl border border-hair bg-surface px-4 py-3">
          <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">Also ask apps to limit what people can do (optional)</summary>
          <fieldset className="mt-2 space-y-1" disabled={disabled}>
            <legend className="sr-only">Ask PDF apps not to allow</legend>
            {(
              [
                ['printing', 'Printing'],
                ['copying', 'Copying text and pictures'],
                ['editing', 'Editing and changing pages'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-strong">
                <input type="checkbox" className="h-5 w-5 accent-coral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500" checked={block[key]} onChange={(e) => setBlock((b) => ({ ...b, [key]: e.target.checked }))} />
                Don’t allow {label.toLowerCase()}
              </label>
            ))}
          </fieldset>
          <p className="mt-3 text-sm text-muted" data-testid="permissions-note">
            These are requests, not a lock. Most PDF apps follow them, but anyone who can open the file can use other tools that ignore them. The password above is the only thing that stops people opening it.
          </p>
        </details>

        <button type="submit" className={PRIMARY} disabled={disabled || !check.ok}>
          Protect PDF
        </button>
      </form>
    </div>
  );
}
