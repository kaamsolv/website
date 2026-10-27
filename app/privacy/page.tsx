import type { Metadata } from 'next';
import { TextPage } from '../_components/text-page';
import { AnalyticsChoice } from '../_components/analytics';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What KaamSolv collects, why, and what it never does. Most tools run in your browser and send us nothing; accounts are optional.',
  alternates: { canonical: '/privacy' },
};

/*
 * Keep this page true to the code. If a change adds a cookie, analytics, ads,
 * a third-party service or a new stored field, update this page in the same
 * change (and the "Last updated" date).
 */
export default function PrivacyPage() {
  return (
    <TextPage
      title="Privacy"
      intro="The short version: most KaamSolv tools run entirely in your browser and send us nothing. You don't need an account. If you create one, we keep only what you save and what signing in needs."
      updated="2026-10-26"
    >
      <h2>Who we are</h2>
      <p>
        KaamSolv (“we”, “us”) runs the website kaamsolv.com. For anything about your data, email{' '}
        <a href="mailto:kaamsolv@gmail.com?subject=Privacy%20request">kaamsolv@gmail.com</a>.
      </p>

      <h2>Tools that send us nothing</h2>
      <p>These tools work on your device. Your input never reaches our servers:</p>
      <ul>
        <li>
          <strong>Image converters</strong> (JPG, PNG, WEBP, HEIC, AVIF). Your images are converted in your
          browser and are not uploaded.
        </li>
        <li>
          <strong>PDF tools</strong> (Compress, Merge, Split, PDF to JPG, JPG to PDF). Your PDFs and images are
          processed in your browser and are not uploaded. The page loads the PDF reader&apos;s decoder and font
          files from kaamsolv.com; nothing about your files is sent with them.
        </li>
        <li>
          <strong>QR Code Generator.</strong> The QR code is built in your browser. Links, Wi-Fi passwords,
          contact details and UPI IDs you enter are not sent to us or to any QR service. The one exception is
          when you&apos;re signed in and press “Save tracked QR” to count scans: then the link, the name you
          chose and the look of the code are saved to your account (see below). Wi-Fi passwords and other
          types can&apos;t be tracked and are never saved.
        </li>
        <li>
          <strong>Invoice Generator, when you&apos;re not signed in.</strong> The invoice and its PDF are made in
          your browser. Your draft is kept on your device (in local storage) so a refresh doesn&apos;t lose it —
          it isn&apos;t sent to us.
        </li>
      </ul>

      <h2 id="accounts">Accounts (optional)</h2>
      <p>
        You can create a free account to save invoices and reuse your business details. If you do, we store:
      </p>
      <ul>
        <li>
          <strong>Your email address</strong>, and your name if you sign in with Google. We don&apos;t keep your
          Google profile photo or any Google access tokens — we never act on your Google account.
        </li>
        <li>
          <strong>How you sign in</strong>: that your account is linked to Google (Google&apos;s ID for you), or
          that you use email links.
        </li>
        <li>
          <strong>Your sign-in sessions</strong>: a random session code, when it expires, and the type of browser
          you used (its “user agent”). Not your IP address.
        </li>
        <li>
          <strong>What you choose to save</strong>: your invoices; your business details and settings (name,
          address, state, GSTIN, email, phone, logo, bank account and UPI details, invoice numbering and defaults);
          your saved customers (name, contact, email, phone, address, state, GSTIN); and your saved items
          (name, HSN/SAC code, unit, rates). Invoices and customers include your clients&apos; details that you
          type in — please only save client information you&apos;re allowed to keep for your business.
        </li>
        <li>
          <strong>Payments you record on an invoice</strong>: for each one, the amount, the date you received it,
          how it was paid (UPI, bank transfer, cash, card, cheque or other), a reference (such as a transaction
          number) and a note if you add them, and — if you void a mistaken payment — when you voided it and the
          reason you gave. An invoice&apos;s received total and its status (unpaid, partly paid, paid) follow from
          these. An invoice you marked paid before payments could be recorded keeps that mark, with no payment
          details. These are your own records of money you were paid; we don&apos;t see or move any money.
        </li>
        <li>
          <strong>Plans you buy from KaamSolv</strong>: the plan, the amount, the date, Razorpay&apos;s order and
          payment references, and whether the payment went through, was refunded or was disputed. Payment is taken
          by Razorpay, so your card, UPI or bank details go to Razorpay and never to us. If you delete your account,
          your plan access goes with it; we keep the sale itself (amount, date, references) without any link to
          you, so we can account for what we sold.
        </li>
        <li>
          <strong>A history of each payment</strong>: every time a payment is recorded, voided, or has its
          reference or note changed, we keep a dated entry — including the reference and note as they were before
          an edit. We keep this history for as long as the invoice exists. It isn&apos;t shown anywhere in your
          account, and changing a note doesn&apos;t remove the earlier wording from it; deleting the invoice, or
          your account, deletes the payments and their history with it.
        </li>
        <li>
          <strong>Tracked QR codes you save</strong>: its name, type, the link it leads to, the look of the code
          (never your logo), a short KaamSolv link, and a count of scans with their times. Scans are counted the
          same way as short-link clicks (see below) — no IP address, no identifier for the person. Deleting a
          code deletes its scans, and a printed copy then stops working.
        </li>
        <li>
          <strong>Sign-in links</strong>: when you ask for one, we store a scrambled (hashed) copy of the link
          code and your email address until it&apos;s used or expires 15 minutes later. We count requests per
          email address and per IP code to stop people flooding an inbox.
        </li>
      </ul>
      <p>
        We use this only to run your account. Nobody else can see your saved invoices or payments, and we don&apos;t look
        at them unless you ask us to help with a problem. We don&apos;t keep a copy of the reports and CSV files you
        download.
      </p>

      <h2>The URL Shortener</h2>
      <p>A short link has to live on our server so it can work for anyone who clicks it. So we store:</p>
      <ul>
        <li>
          <strong>The link you shorten</strong> (the destination address), the short code, when it was
          created and when it expires, if you chose that.
        </li>
        <li>
          <strong>A one-way code made from your IP address</strong>, not the address itself. We mix your IP
          with a secret value and scramble it, so we can spot abuse and enforce limits without storing who you
          are.
        </li>
        <li>
          <strong>Basic click counts.</strong> When someone opens a short link we record the time, the type of
          device (phone, tablet, computer or bot), the website they came from (just the domain, such as
          twitter.com, not the full page) and their country. We do not store their IP address, browser
          details or any identifier for them.
        </li>
      </ul>
      <p>
        Please don&apos;t shorten links that contain private information (for example a password or personal
        details in the address). Anyone with the short link can reach the destination.
      </p>

      <h2>Reports</h2>
      <p>
        If you <a href="/report-link">report a link</a>, we store the link, the reason, anything you write in the
        details box, and the same one-way IP code as above. We use reports only to review and remove harmful
        links.
      </p>

      <h2>Limits and abuse protection</h2>
      <p>
        To stop misuse we count requests per IP code over short periods (for example, how many links were
        created in the last minute). These counters reset on their own.
      </p>

      <h2 id="analytics">Analytics</h2>
      <p>
        We&apos;d like to know which pages and tools people use, so we can fix and build the right things. We use two
        services for that.
      </p>
      <p>
        <strong>Google Analytics</strong> is <strong>off until you say yes</strong>. When you first visit, a small
        banner asks. If you choose “No thanks”, nothing is sent to Google and no Google cookie is set. If you choose
        “Accept analytics”, Google Analytics sets cookies (<code>_ga</code> and <code>_ga_…</code>) and receives the page
        you&apos;re on (its address and its title), the page you came from, your approximate location, your browser and device type, and your IP address (Google says Google
        Analytics 4 doesn&apos;t log or store IP addresses). It also receives a few tool events:
        that a tool page was opened, that a tool finished its job, that a file was downloaded (only its type, such as
        “pdf”), that something failed (only a short label, such as “network”), and which other website you
        clicked a link to.
      </p>
      <p>
        We <strong>never</strong> send Google your files, file names, text, numbers, invoice details, the links you
        shorten, or error messages. We cut page addresses off before any <code>?</code> or <code>#</code> before giving
        them to Google Analytics, and we ask its script to use those shortened addresses for anything it measures on
        its own too. On your account pages (addresses starting <code>/app</code>) we don&apos;t load Google Analytics at
        all, so nothing there is counted. We&apos;ve switched off Google&apos;s
        advertising features and signals in how we set Analytics up on this site.
      </p>
      <AnalyticsChoice />
      <p>
        <strong>Cloudflare Web Analytics</strong> is our host&apos;s page-speed and visit counter. It runs on every page
        without asking. Cloudflare says it doesn&apos;t use cookies or local storage and doesn&apos;t track you across
        sites, and we haven&apos;t seen it set any. Your browser loads a small script from <code>static.cloudflareinsights.com</code> and sends Cloudflare
        page-load timings, the page address and your browser type to <code>/cdn-cgi/rum</code> on kaamsolv.com.
      </p>
      <p>
        We ask for your consent before using Google Analytics, and you can withdraw it at any time with the
        button above. We try to follow India&apos;s Digital Personal Data Protection Act, 2023. This page is a
        plain-English summary, not legal advice.
      </p>

      <h2 id="cookies">Cookies and browser storage</h2>
      <p>
        <strong>Advertising trackers:</strong> none. <strong>Analytics cookies:</strong> only if you accept Google
        Analytics above. If you don&apos;t sign in and don&apos;t accept analytics, we don&apos;t set any cookies.
      </p>
      <p>
        If you sign in, we set <strong>one session cookie</strong> (<code>kk.session_token</code>) that keeps you
        signed in for up to 30 days. It&apos;s strictly necessary for your account and can&apos;t be read by other
        websites. Signing in with Google also sets short-lived cookies that protect the sign-in itself and are
        removed when it finishes.
      </p>
      <p>
        Your browser also keeps a few things on your device (in local storage): your light/dark choice, your
        Invoice Generator draft, and a note that this browser has signed in before (so the site knows to show
        your account menu), and your analytics choice. They never leave your device unless you save an invoice to your account, and you can
        clear them in your browser settings.
      </p>
      <p>
        Our hosting provider, Cloudflare, may in some cases set a strictly necessary security cookie, for
        example to tell real visitors from automated traffic.
      </p>

      <h2>Who helps us run KaamSolv</h2>
      <ul>
        <li>
          <strong>Cloudflare</strong> hosts the website and delivers every page, so it handles your requests
          (including your IP address) to do that. It keeps short-term technical logs, and runs Cloudflare Web Analytics
          (see Analytics).
        </li>
        <li>
          <strong>Google Analytics</strong>, only if you accept it, as described under Analytics. Its servers may be
          outside India.
        </li>
        <li>
          <strong>Neon</strong> hosts our database, in Singapore — the URL Shortener and accounts, including
          saved invoices.
        </li>
        <li>
          <strong>Google</strong>, only if you choose “Continue with Google”, to confirm who you are. Google sees
          that you signed in to KaamSolv.
        </li>
        <li>
          <strong>Resend</strong> sends our sign-in emails, so it handles your email address and the link.
        </li>
      </ul>
      <p>
        We don&apos;t sell your data, and we don&apos;t share it with anyone else unless the law requires it.
        Because our providers run servers in different countries, your data may be processed outside India.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Short links and their click counts: for as long as the link exists.</li>
        <li>Reports: as long as we need them to deal with the link.</li>
        <li>Abuse-protection counters: they reset within minutes to a day.</li>
        <li>
          Your account, saved invoices (with their recorded payments and payment history), customers, items, tracked
          QR codes (with their scans) and settings: until you delete them or your account. Deleting an invoice, a QR
          code or your account removes it from our database straight away; our database provider&apos;s
          short-term backups are overwritten within days.
        </li>
        <li>Sign-in sessions: 30 days after you last used KaamSolv, or when you sign out.</li>
        <li>Sign-in links: 15 minutes, or until used.</li>
      </ul>

      <h2>Your choices and rights</h2>
      <p>
        If you have an account, you can delete any saved invoice yourself, and delete your whole account at{' '}
        <a href="/app/account">Account → Delete my account</a>. That removes your account, invoices, recorded payments and their history, customers, items and business
        details.
      </p>
      <p>
        You can also ask us what data we hold about you, ask us to correct it, or ask us to delete it. Because short
        links are anonymous, tell us the short link and anything that helps us confirm it&apos;s yours, and
        we&apos;ll take it down. Email{' '}
        <a href="mailto:kaamsolv@gmail.com?subject=Privacy%20request">kaamsolv@gmail.com</a> and we&apos;ll reply
        as soon as we can, within the time the law requires.
      </p>
      <p>
        If you&apos;re not happy with our answer, you can also complain to the Data Protection Board of India.
      </p>

      <h2>Children</h2>
      <p>KaamSolv is not meant for children under 18, and we don&apos;t knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>
        If we add something that changes what we collect (for example paid plans or ads), we&apos;ll
        update this page first and change the date at the top.
      </p>
    </TextPage>
  );
}
