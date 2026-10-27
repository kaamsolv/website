# Paid plans: Terms and Refund & Cancellation text — DRAFT for review

**Status: draft. Not on the website.** Written for you and your CA or lawyer to edit. It is plain-English wording, not legal
advice, and it fixes nothing about tax or consumer law. Everything in [square brackets] is a fact or a choice only you can supply.
Why it exists: the live Terms page has nothing about paid plans, and one line on it ("KaamSolv doesn't process or confirm
payments") is about UPI QR codes but will read as a contradiction once KaamSolv takes payments. Razorpay's account activation also
asks for published Terms, Privacy, Refund and Cancellation, and Contact pages. Check their current checklist; I could not confirm it.

What the product actually does today (so the text stays true): see [`billing.md`](billing.md).

---

## 1. Paid plans (goes in the Terms page)

**What you can buy.** KaamSolv's free tools stay free. You can also buy **Invoice Pro**, **QR Pro**, or **Invoice + QR Pro**, for one
month or one year at a time. The price you pay is the price shown at checkout. [State whether prices include GST. Decide with your CA.]

**One payment, one period.** A plan does not renew by itself. When your month or year ends, your account goes back to the free
account, and your saved work stays. To carry on, buy again; if you buy before it ends, the new period starts when the old one ends.

**Paying.** Payments are taken by Razorpay. Your card, UPI or bank details go to Razorpay and never to KaamSolv. Your plan switches
on when Razorpay confirms the payment, usually within a minute. You get an invoice by email with a private link.

**Prices.** We may change prices. A change never affects a period you have already paid for.

**Plans can stop.** If you break the rules of use (for example, using KaamSolv to send harmful links), we can end your access. [If we
end it for any other reason, say whether the unused part is refunded. Suggested: yes, in full.]

**Who sells it.** [Legal name of the seller (Beam Me Up), address, GSTIN if registered.]

## 2. Refund and cancellation policy (its own page, linked from checkout)

**Cancelling.** There is nothing to cancel, because a plan doesn't renew. You can stop any time by not buying again, and you keep your
plan until the period you paid for ends.

**Refunds.** [Choose one. Suggested: A.]

- **A (suggested).** Email us within **7 days** of a purchase and we'll refund it in full, no questions. After 7 days we refund only if
  we charged you twice or charged you for something you did not get.
- **B.** We don't refund after a plan switches on, except if we charged you twice or you didn't get what you paid for.

**Always refunded, in full:** a duplicate charge, and a payment that was taken but did not switch your plan on within [24 hours],
once we have checked it.

**How.** Email [support address] from the address on your account, with the invoice number. We reply within [2] working days. A
refund goes back to the way you paid. How long it takes to show up depends on your bank or card issuer; Razorpay can tell you
more. [Check the typical time on Razorpay's site and state it.]

**What a refund does.** A full refund ends the plan straight away (that is how the product behaves today), and your account goes
back to the free account. Your saved work stays. A partly refunded payment does not end the plan; we handle it case by case.

**Disputes.** If you raise a dispute (a chargeback) with your bank, we may pause the plan while it is looked at. Writing to us
first is quicker.

## 3. Contact and complaints (its own page, or the Contact page)

[Support email. Postal address. Response time.] [Ask your CA or lawyer whether the e-commerce rules oblige you to name a grievance
officer, and what to publish; I have not checked this.]

## 4. Small fix to the existing Terms page
Change "KaamSolv doesn't process or confirm payments" to say it is about your customers' UPI payments: *"A UPI QR code fills in
payment details in a payment app. KaamSolv doesn't process or confirm those payments."* (Plan purchases are the exception, and are
covered in section 1.)

## 5. Things the text assumes, so they must stay true
| Statement | Where it comes from |
|---|---|
| Plans don't auto-renew | Razorpay Orders, not Subscriptions (decided in M1) |
| A full refund ends the plan at once | `refund.processed` handling in `db/billing.ts` |
| Early renewal starts after the current period | `greatest(current end, now) + period` in the grant statement |
| Invoice emailed with a private link | M2 |
| A dispute pauses the plan | `payment.dispute.created` handling |
