import { Icon } from './icons';

/**
 * A calm, readable message block for "this couldn't load" and similar. Same words as before, one look:
 * tinted background, hairline border, a mark that isn't colour alone. It does not add actions: where a page
 * has a recovery step (refresh, try again), the message already says so.
 * `role` stays the caller's choice ("alert" for something that just failed, "status" for information).
 */
export function Notice({
  tone = 'error',
  role,
  className = '',
  children,
}: {
  tone?: 'error' | 'info';
  role?: 'alert' | 'status';
  className?: string;
  children: React.ReactNode;
}) {
  const look = tone === 'error' ? 'border-danger-200 bg-danger-50 text-danger-700' : 'border-hair bg-wash text-strong';
  return (
    <div role={role} className={`flex items-start gap-3 rounded-xl2 border px-4 py-3 text-sm font-medium ${look} ${className}`}>
      <Icon name={tone === 'error' ? 'flag' : 'sparkle'} className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
