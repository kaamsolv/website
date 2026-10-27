# Billing — selling KaamSolv plans (Razorpay)

Status: **M1 committed (`b7c976d`); M2 built locally, not committed. Nothing deployed; migrations 0011 and 0012 not applied.** Plan approved 2026-10-27.
Separate from the invoice payment ledger, which records money a user's own customers paid *them*
([`invoice-generator.md`](invoice-generator.md)). This is KaamSolv's own sales. Later milestones (invoice email, secure
links, WhatsApp share) are M2, below; summaries and accountant packs (M3, M4) are not started.

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

## M2 — invoice, email, private link, WhatsApp share

### The flow
`payment.captured` → (same statement as M1's pay-and-grant) → queue `billing_invoice:<payment id>` in `outbox` → right after the
reply, one attempt runs (`after()`); the Cloudflare cron (`*/15 * * * *`, `worker/index.ts` → `POST /api/billing/drain` with
`CRON_SECRET`) retries what failed or was waiting. The job (`app/lib/billing/jobs.ts`):
1. **Invoice** (`db/billing-invoice.ts`): one statement locks the payment row, takes the next number from the seller's profile,
   saves the invoice and links it, so a number can't be taken twice or skipped and a payment can't get two invoices (tested with
   every payment issued twice at once). Then a ledger entry (method "other", the payment id as idempotency key) so it reads **Paid**
   in the seller's Invoices, Payments & collections and Reports.
2. **Link**: reuses the live `billing` link or makes one.
3. **Email** (`sendEmailChecked`, sender `billing@send.kaamsolv.com`): says what happened (`{ok}` or a short code), passes the job's
   key as `Idempotency-Key`. Missing key → `blocked`; a refusal or network error → retry with back-off 1, 5, 30, 120, 360 minutes,
   then `dead` (visible to `listStuck`). A failure never touches the payment or the plan.
Refunded, failed, or buyer-deleted payments are skipped; an invoice the seller later deletes is **not** remade.

### What is decided, what is not (the owner's call before launch)
- `BILLING_SELLER_EMAIL`: a real KaamSolv account whose **Business profile** (name, address, GSTIN, state) is the seller. Not set →
  `blocked: seller_account_not_set`. Profile empty → `blocked: seller_not_configured`.
- `BILLING_TAX_TREATMENT`: `none` (no GST on the invoice; a composition seller gets a Bill of Supply) or `inclusive` with
  `BILLING_TAX_RATE` (GST in the price; needs a valid GSTIN, not composition). **Unset or `exclusive` → blocked.** Place of supply
  is the seller's state because the buyer's isn't collected (**confirm with the CA**). `BILLING_SAC` prints a SAC on the line; it is
  never invented.
- **Finding:** at 18% inclusive, ₹149 monthly can't be split into CGST + SGST that add back to ₹149.00 (one paisa out either way), so
  that invoice would be refused (`rounding_mismatch`); the other five launch prices reconcile at 5% and 18%. If the owner is GST
  registered, change the price (₹150) or move to "tax added on top" (needs a checkout change; not built).
- Invoice number format is the seller's ordinary `INV-0001` series, shared with their other invoices.
- **No unique index on `(user_id, number)` yet**: production may already hold duplicates. Check with
  `select user_id, number, count(*) from invoices where kind = 'invoice' group by 1, 2 having count(*) > 1;` first; allocation here
  is safe without it.

### Private links
`/i/<token>`: 22 URL-safe characters (132 bits) derived from the link's id and `BETTER_AUTH_SECRET` (HMAC), only the SHA-256 stored,
so the same URL can be rebuilt for a resend. A **bearer link**: anyone holding it can read that one invoice and its PDF until it is
turned off (`DELETE /api/invoices/<id>/link`) or expires (no automatic expiry yet; `expires_at` exists). Wrong, revoked, expired and
short tokens are the same plain 404. The page is `noindex`, `Referrer-Policy: no-referrer`, `no-store`, shows no account, customer
or link id, and `robots.txt` disallows `/i/`. **Rotating `BETTER_AUTH_SECRET` breaks every invoice link.** Views are counted (chat-app
link previews can count too).

### Share on WhatsApp (D1)
On a saved invoice's page: Share on WhatsApp opens `https://wa.me/<client number>?text=…` with seller, client's first name, number,
amount, due date and link. The client's number comes from the **saved customer** the invoice is linked to (a saved invoice doesn't
keep a phone); without one WhatsApp asks who to send it to. The user presses send. Nothing is automatic. Automated WhatsApp (D2)
needs the WhatsApp Business Platform (provider, Meta business verification, approved templates, opt-in, per-message charges): not
built, not started.

### Server PDF
`app/lib/invoice/server-pdf.ts` on `app/lib/pdf/mini-pdf.ts` (about 100 lines, no dependency): A4, built-in Helvetica, ASCII only, so
amounts read "Rs. 1,490.00" and Indian-script text becomes "?". The browser PDF users make in the app is unchanged. `pdf-lib` and
`@react-pdf` are deliberately stubbed out of the Worker (`next.config.mjs`), which is why this exists.

### Worker size (needs a decision)
Gzipped Worker: **2,730 KiB at M1 → 2,966 KiB now, limit 3,072 (free plan)**. The bundler keeps a separate ~255 KB copy of the database
layer for each distinct set of routes; all billing/link routes now go through one door (`app/lib/billing/api/index.ts`) so they share
a copy (this saved 38 KiB). **M3 and M4 will not fit.** Recommendation: move to the Workers Paid plan (limit 10 MiB, about USD 5 a
month); it also suits a business taking payments. Needs the owner's yes; nothing was changed on the account.

### Safeguards added after review (M2.5)
- The account named in `BILLING_SELLER_EMAIL`, and any account holding a sales invoice, **can't be deleted** (409), and a sales
  invoice can't be deleted from the invoice list (409). Deleting them would delete the sales records.
- `npm run billing:status` (read-only, `db/billing-status.mts`): payments by status, paid payments still waiting for an invoice,
  outbox jobs and the stuck ones, webhook events that didn't finish, and which billing settings this machine has (names only).
  Run it against production with the production `DATABASE_URL` after any real payment, and daily at first.
- The privacy page says the sales invoice (with the buyer's name and email) is kept after the buyer deletes their account.
- Draft Terms and Refund & Cancellation wording for the owner's and CA's review: [`billing-policies-DRAFT.md`](billing-policies-DRAFT.md).
  Not on the site.

### Not in M2
Automated WhatsApp, receivables summaries, accountant packs, automatic link expiry, an unsubscribe/consent store, a support screen
for stuck jobs (`listStuck` is the query), refund-credit-notes for the sales invoice (a refunded payment keeps its invoice).

### M2 code
| Piece | File |
|---|---|
| Invoice document, tax treatment | `app/lib/billing/invoice.ts` |
| Issue the invoice (one statement) | `db/billing-invoice.ts` |
| Outbox | `db/outbox.ts`; job and queueing `app/lib/billing/jobs.ts` |
| Links | `app/lib/links/token.ts`, `db/invoice-links.ts` |
| Email | `app/lib/email.ts` (`sendEmailChecked`), `app/lib/billing/email.ts` |
| Routes (one door) | `app/lib/billing/api/*`; thin route files under `app/api/billing/*`, `app/api/invoices/[id]/link`, `app/i/[token]/pdf` |
| Public page | `app/i/[token]/page.tsx` |
| Share UI | `app/_components/account/invoice-share.tsx`, `app/lib/invoice/share.ts` |
| PDF | `app/lib/invoice/server-pdf.ts`, `app/lib/pdf/mini-pdf.ts` |
| Scheduler | `worker/index.ts`, `wrangler.jsonc` (`main`, `triggers.crons`) |
| Tests | `test/billing-invoices.test.mts` (24), `tests/e2e/invoice-share.spec.ts` (3) |

### Rollback of 0012 (only if nothing has been sold)
```sql
DROP TABLE invoice_links; DROP TABLE outbox;
ALTER TABLE billing_payments DROP COLUMN invoice_id, DROP COLUMN invoiced_at;
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations);
```

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
