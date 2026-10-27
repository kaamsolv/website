import type { Metadata } from 'next';
import { TextPage } from '../_components/text-page';

export const metadata: Metadata = {
  title: 'Refund and cancellation policy',
  description: 'How refunds and cancelling work for KaamSolv paid plans: a plan does not renew by itself, and you can ask for a refund within 7 days.',
  alternates: { canonical: '/refund-policy' },
};

export default function RefundPolicyPage() {
  return (
    <TextPage
      title="Refund and cancellation policy"
      intro="How cancelling and refunds work for KaamSolv paid plans, in plain words."
      updated="2026-10-28"
    >
      <h2>Cancelling</h2>
      <p>
        There is nothing to cancel, because a plan does not renew by itself. You can stop any time by not buying
        again, and you keep your plan until the period you paid for ends. Then your account goes back to the free
        account, and your saved work stays.
      </p>

      <h2>Refunds</h2>
      <ul>
        <li>
          <strong>Within 7 days.</strong> Email us within 7 days of a purchase and we&apos;ll refund it in full, no
          questions asked.
        </li>
        <li>
          <strong>Always, in full.</strong> If we charged you twice, or took a payment that did not switch your plan
          on within 24 hours, we&apos;ll refund it once we have checked it.
        </li>
        <li>
          <strong>After 7 days.</strong> Otherwise we don&apos;t refund a plan that has switched on.
        </li>
      </ul>

      <h2>How to ask</h2>
      <p>
        Email <a href="mailto:kaamsolv@gmail.com?subject=Refund%20request">kaamsolv@gmail.com</a> from the address on
        your account, with your invoice number. We reply within 2 working days. A refund goes back to the way you paid,
        and how long it takes to show up depends on your bank or card issuer.
      </p>

      <h2>What a refund does</h2>
      <p>
        A full refund ends the plan straight away, and your account goes back to the free account. Your saved work
        stays. If only part of a payment is refunded, the plan keeps running and we sort it out with you by email.
      </p>

      <h2>Disputes</h2>
      <p>
        If you raise a dispute (a chargeback) with your bank, we may pause the plan while it is looked at. Writing to
        us first is quicker.
      </p>

      <h2>Who sells it</h2>
      <p>BEAM ME UP, B1/31/3 Safdarjung Enclave, New Delhi 110029. GSTIN 07ACPPV7985A1ZX.</p>

      <h2>Contact</h2>
      <p>
        Questions? Email <a href="mailto:kaamsolv@gmail.com">kaamsolv@gmail.com</a>. See also the{' '}
        <a href="/terms">Terms</a> and the <a href="/privacy">Privacy policy</a>.
      </p>
    </TextPage>
  );
}
