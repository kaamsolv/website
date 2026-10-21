import { redirect } from 'next/navigation';

/** /app has no page of its own yet — saved invoices are the first signed-in page. */
export default function AppIndex() {
  redirect('/app/invoices');
}
