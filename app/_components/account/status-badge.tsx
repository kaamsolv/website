import { paymentSummary, STATE_LABELS } from '@/app/lib/invoice/payments';

const PILL = 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold';

/**
 * Unpaid / Partially paid / Paid / Marked paid, plus Overdue — always words, never colour alone (§29).
 * Overdue = a balance is still owed past the due date. An unpaid overdue invoice reads "Overdue" on its own;
 * a partly paid one keeps "Partially paid" and gains "Overdue" beside it.
 * "Marked paid" is an invoice that was marked paid before payments were recorded: settled, nothing on record.
 */
export function StatusBadge({
  status,
  amountPaid,
  total,
  dueDate,
  today,
}: {
  status: 'unpaid' | 'paid';
  amountPaid: number;
  total: number;
  dueDate: string | null;
  today: string;
}) {
  const s = paymentSummary({ total, amountPaid, status, dueDate }, today);
  const state =
    s.state === 'paid' ? (
      <span className={`${PILL} bg-tealx-100 text-tealx-600`}>{STATE_LABELS.paid}</span>
    ) : s.state === 'marked_paid' ? (
      <span className={`${PILL} bg-wash text-strong`} title="Marked paid before payments were recorded — no payment entries on record">
        {STATE_LABELS.marked_paid}
      </span>
    ) : s.state === 'partial' ? (
      <span className={`${PILL} bg-yellowx-100 text-yellowx-600`}>{STATE_LABELS.partial}</span>
    ) : s.overdue ? null : (
      <span className={`${PILL} bg-wash text-strong`}>{STATE_LABELS.unpaid}</span>
    );
  return (
    <>
      {state}
      {s.overdue && <span className={`${PILL} bg-danger-50 text-danger-600`}>Overdue</span>}
    </>
  );
}
