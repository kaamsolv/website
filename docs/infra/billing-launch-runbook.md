# Billing launch runbook (Razorpay, sales invoices, receivables)

Do these in order. **Steps marked YOU need your accounts or secrets; I can't do them.** Nothing here has been run yet. Everything is
in `main` on GitHub but **not deployed**, and migrations 0011–0013 are **not applied**. Do NOT deploy before step 2: the new code reads
tables that don't exist in production yet, which would break deleting an invoice or an account.

Decisions already made (2026-10-28): prices include 18% GST (shown split on the billing page); seller BEAM ME UP, GSTIN
07ACPPV7985A1ZX, B1/31/3 Safdarjung Enclave, New Delhi 110029; invoice links expire after 90 days; plans don't auto-renew; refunds within
7 days; Workers Paid plan later. Prices: Invoice Pro ₹150 / ₹1,490, QR Pro ₹99 / ₹990, bundle ₹199 / ₹1,990.

## 1. Seller details in the app (YOU, 5 minutes)
1. Pick the KaamSolv account that will issue the invoices (your own is fine). Note its email: that is `BILLING_SELLER_EMAIL`.
2. Sign in to kaamsolv.com with it → **Business profile** (`/app/business`). Fill: Business name `BEAM ME UP`; Address
   `B1/31/3 Safdarjung Enclave, New Delhi - 110029`; State `Delhi`; GSTIN `07ACPPV7985A1ZX`; email and phone; bank or UPI if you want it printed.
   Leave "composition scheme" **off** (it can't charge GST). Invoice number prefix: `INV-` is fine.
3. Ask your CA for the **SAC code** for these plans; later set `BILLING_SAC` (optional; it prints on the invoice line).

## 2. Database (YOU run it; I can't reach production)
Follow `docs/infra/deployment.md` → "Applying a migration to production (atomic runner)" exactly:
1. Neon: create a **restore point** (or a branch) of `production`; note the time.
2. Dry run: `npm run db:migrate:atomic -- --expect-host <your production host>` and read it. Expect pending: `0011_billing`, `0012_billing_invoices`,
   `0013_notification_prefs`.
3. Optional first (read-only): duplicate invoice numbers, to decide on a unique index later:
   `select user_id, number, count(*) from invoices where kind = 'invoice' group by 1, 2 having count(*) > 1;`
4. Apply with `--confirm --restore-point-taken` as that section says.
Tell me when it is done and I'll deploy (step 5), after you have set the secrets (step 4).

## 3. Razorpay dashboard, TEST mode first (YOU)
Use the **Test mode** switch in the dashboard for steps a–c.
a. **Settings → API Keys → Generate Test Key.** Keep the Key Id (`rzp_test_…`) and Key Secret. Never paste them in chat, a file or git.
b. **Settings → Payment capture:** make sure **automatic capture** is on (otherwise uncaptured payments are refunded automatically).
c. **Settings → Webhooks → Add new webhook:**
   - URL: `https://kaamsolv.com/api/billing/webhook`
   - Secret: type a long random string and keep it (this is `RAZORPAY_WEBHOOK_SECRET`).
   - Events to tick: `payment.captured`, `payment.failed`, `refund.processed`, and the dispute events (`payment.dispute.created`, `.won`, `.lost`, `.closed`).
   - Save. (Razorpay may only show the live-mode webhook form once the account is activated; repeat step c in Live mode later with the same URL
     and a new secret.)

## 4. Worker secrets (YOU, in a terminal in the project folder)
Each command asks you to type the value; nothing is stored in the repo. Test values first.
```bash
npx wrangler secret put RAZORPAY_KEY_ID          # rzp_test_...
npx wrangler secret put RAZORPAY_KEY_SECRET
npx wrangler secret put RAZORPAY_WEBHOOK_SECRET  # the string you typed in the webhook form
npx wrangler secret put CRON_SECRET              # any long random string, e.g. from: node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
npx wrangler secret put BILLING_SELLER_EMAIL     # the account email from step 1
npx wrangler secret put BILLING_TAX_TREATMENT    # inclusive
npx wrangler secret put BILLING_TAX_RATE         # 18
npx wrangler secret list                         # check RESEND_API_KEY is there too (needed for emails)
```
Also confirm in Resend that `send.kaamsolv.com` is verified (billing@ and summary@ send from it).

## 5. Deploy (me, after you say steps 2 and 4 are done)
Push is done; I run the guarded deploy (`npm run cf:deploy`) and check: the Terms and Refund pages, `/api/billing/webhook` answers 400 to a
bad signature (not 503), the billing page loads, and `/sitemap.xml`. First real use of the new Cloudflare size limit and the 15-minute cron.

## 6. Test-mode purchase (YOU with me)
1. Sign in with a second (or your own) account, open `/app/billing`, choose a plan, pay with a Razorpay **test** card or UPI
   (Razorpay's "test cards" page lists them).
2. Within a minute the page should say "You're all set" and the plan should be on.
3. Check your email for the invoice; open the link; download the PDF; check the GST split (CGST 9% + SGST 9%).
4. `npm run billing:status` (with the production `DATABASE_URL`): payments `paid`, no stuck jobs, no unfinished events.
5. In Razorpay (test) refund that payment in full. The plan should end within a minute; status shows `refunded`.

## 7. Go live (YOU)
Replace `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` with the **live** key and `RAZORPAY_WEBHOOK_SECRET` with the live webhook's secret
(`npx wrangler secret put …` again; takes effect immediately). Make one real purchase yourself (the cheapest plan), check steps 6.2–6.4,
then refund it. Ask your CA to look at the first real invoice.

## Rolling back
Remove the Razorpay secrets (`npx wrangler secret delete RAZORPAY_KEY_SECRET`): checkout answers "Payments aren't switched on yet" and nothing
else changes. Migrations stay; the rollback SQL is in `docs/products/billing.md`.
