# Billing — selling KaamSolv plans (Razorpay)

Status: **Milestone M1 built locally, not committed, not deployed, migration 0011 not applied.** Plan approved 2026-10-27.
Separate from the invoice payment ledger, which records money a user's own customers paid *them*
([`invoice-generator.md`](invoice-generator.md)). This is KaamSolv's own sales. Later milestones (invoice email, secure
links, WhatsApp share, summaries, accountant packs) are not started.

## What M1 does
A signed-in user opens **Plans and billing** (`/app/billing`), picks a plan and Monthly/Yearly, and pays in Razorpay's checkout
(card, UPI, netbanking). **The webhook, not the browser, switches the plan on.** After checkout the page waits for the server
to confirm, for up to a minute. Until the Razorpay keys are set the page says "Payments aren't switched on yet" and checkout
answers 503. The page is not in the navigation yet (so nobody finds an unfinished feature); add the link at the release gate.

## Plans and launch prices (approved 2026-10-27; GST treatment still open, see below)
| Plan (`plan_key`) | Monthly | Yearly (≈ two months free) | Switches on |
|---|---|---|---|
| Invoice Pro (`invoice_pro`) | ₹149 | ₹1,490 | the existing Invoice Pro features |
| QR Pro (`qr_pro`) | ₹99 | ₹990 | the existing QR Pro features |
| Invoice + QR Pro (`invoice_qr_bundle`) | ₹199 | ₹1,990 | **both** plans above (a price-list entry only, so features can't drift) |

Prices are generous on purpose and live in the `plan_prices` table (paise); changing one is a row update, never a code change,
and the checkout reads the amount from there, never from the browser. Plan: raise later toward ₹249–299 (Invoice Pro) and
₹149 (QR Pro); people already subscribed keep their launch price (the price they paid is on their payment row). Competitor
prices were not researched live; check before launch.

## How a payment becomes access
1. `POST /api/billing/checkout` (signed in, same-site, rate limited) prices the plan from the table, writes a `created`
   row in `billing_payments`, creates a Razorpay order, stores its id, returns what Checkout needs. Nothing is granted.
2. Razorpay calls `POST /api/billing/webhook`. The raw body is checked against `X-Razorpay-Signature` (HMAC-SHA256, the
   webhook secret, constant-time). Wrong or missing → 400 and nothing is read.
3. `x-razorpay-event-id` is the idempotency key (`billing_events.provider_event_id` is unique). A repeat is answered 200
   and changes nothing; an earlier delivery that died part-way is processed again, safely.
4. `payment.captured` is **one SQL statement**: claim the payment (`created|failed → paid`, only one delivery can win) *and*
   upsert the subscription(s) (`razorpay:<user>:<plan>`), extending from the later of now and the current end. Amount and
   currency must equal the order's, or it is `rejected` (event row `failed`, nothing granted).
5. Entitlements are read from `subscriptions` on every request (`db/entitlements.ts`), unchanged.

| Event | Effect |
|---|---|
| `payment.captured` | Paid, plan on for one month/year (above) |
| `payment.failed` | Checkout row → `failed`, only if still `created` (a late "failed" can't undo a paid order) |
| `refund.processed` | **Full** refund: payment → `refunded`, access ends now. **Partial**: recorded as `ignored: partial_refund` for support |
| `payment.dispute.created` | Payment → `disputed`, plan `suspended` |
| `payment.dispute.won` | Back to `paid`, plan `active` |
| `payment.dispute.lost` / `closed` | Left suspended; `ignored: dispute_*_needs_review` for support |
| anything else (`payment.authorized`, `order.paid`, …) | Recorded, `ignored` |

A refund or dispute for a payment not seen yet answers **503** (Razorpay redelivers), so out-of-order delivery heals itself.
Event/payload names were checked against Razorpay's documentation on 2026-10-27; re-check before launch.

## Decisions taken in M1 (owner can change)
- **Orders first, auto-renew later.** Each purchase is one paid period; renewing is buying again. Razorpay Subscriptions
  (automatic renewal) is deferred until after the first real payments. The bundle's refund/dispute affects both plans.
- **A full refund ends access immediately** (default, recommended; the owner didn't answer, so this stands until changed).
  A refund ends *that plan's* access entirely, including days from other purchases of the same plan.
- **Sales records survive account deletion**, unlinked (`billing_payments.user_id` → null), with no name, email or card detail.
  The privacy page says so. Confirm with the owner's CA that this retention is what they want.
- **Subscription rows** keep `provider = razorpay`, `provider_ref = razorpay:<user>:<plan>`; one row per user and plan.

## Needs the owner before going live
1. **GST treatment of the prices** (are ₹149/₹99/₹199 tax-inclusive? is the seller registered?) and the seller's legal name
   (Beam Me Up), GSTIN, address: needed for M2 invoices. Not guessed.
2. Razorpay account activation, **test** keys, a webhook endpoint `https://kaamsolv.com/api/billing/webhook` subscribed to:
   `payment.captured`, `payment.failed`, `refund.processed`, `payment.dispute.created/won/lost/closed`; **auto-capture must be on**
   (Razorpay refunds uncaptured payments); a webhook secret. Keys and the secret are Worker secrets, never files
   (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`).
3. Release steps (not done): Neon restore point, `0011` via the atomic runner, a test-mode rehearsal, then one live ₹1
   payment with the owner present; add the page to the navigation.

## Code
| Piece | File |
|---|---|
| Periods, bundle, price label | `app/lib/billing/plans.ts` |
| Razorpay: order, signature, webhook parsing | `app/lib/billing/razorpay.ts` |
| Prices, checkout rows, webhook processing, status | `db/billing.ts` |
| Routes | `app/api/billing/{checkout,webhook,status}/route.ts` |
| Page | `app/app/billing/page.tsx`, `app/_components/account/billing-panel.tsx` |
| Schema / migration | `db/schema.ts`, `db/migrations/0011_billing.sql` |
| Tests | `test/billing.test.mts` (28), `tests/e2e/billing.spec.ts` (8) |

## Not in M1
Server-built invoices and their email, `/i/<token>` links, WhatsApp, receivables summaries, accountant packs, outbox, the
unique-invoice-number index (all later milestones, each with its own migration), auto-renewing Subscriptions, a support
screen (`listProblemEvents` in `db/billing.ts` is the query for one), GST invoices for these sales.

## Rollback of 0011 (only if nothing has been sold)
```sql
DROP TABLE billing_payments; DROP TABLE billing_events; DROP TABLE plan_prices;
DELETE FROM plans WHERE plan_key = 'invoice_qr_bundle';
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
```
