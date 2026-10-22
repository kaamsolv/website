/** Paid / Unpaid / Overdue — words, not just colour (§29). Overdue = unpaid past its due date. */
export function StatusBadge({ status, dueDate, today }: { status: 'unpaid' | 'paid'; dueDate: string | null; today: string }) {
  const overdue = status === 'unpaid' && !!dueDate && dueDate < today;
  const [label, cls] =
    status === 'paid'
      ? ['Paid', 'bg-tealx-100 text-tealx-600']
      : overdue
        ? ['Overdue', 'bg-danger-50 text-danger-600']
        : ['Unpaid', 'bg-wash text-strong'];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}
