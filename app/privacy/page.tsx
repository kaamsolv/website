import type { Metadata } from 'next';
import { TextPage } from '../_components/text-page';

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
      updated="2026-10-21"
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
          <strong>QR Code Generator.</strong> The QR code is built in your browser. Links, Wi-Fi passwords,
          contact details and UPI IDs you enter are not sent to us or to any QR service.
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
          type in — please only save client information you&apos;re allowed to keep for your business. If you use
          paid / unpaid tracking, we also store whether and when each invoice was paid.
        </li>
        <li>
          <strong>Sign-in links</strong>: when you ask for one, we store a scrambled (hashed) copy of the link
          code and your email address until it&apos;s used or expires 15 minutes later. We count requests per
          email address and per IP code to stop people flooding an inbox.
        </li>
      </ul>
      <p>
        We use this only to run your account. Nobody else can see your saved invoices, and we don&apos;t look
        at them unless you ask us to help with a problem.
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

      <h2 id="cookies">Cookies and browser storage</h2>
      <p>
        There are <strong>no advertising or analytics trackers</strong> on KaamSolv. If you don&apos;t sign in,
        we don&apos;t set any cookies.
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
        your account menu). They never leave your device unless you save an invoice to your account, and you can
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
          (including your IP address) to do that. It keeps short-term technical logs.
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
          Your account, saved invoices, customers, items and settings: until you delete them or your account. Deleting an
          invoice or your account removes it from our database straight away; our database provider&apos;s
          short-term backups are overwritten within days.
        </li>
        <li>Sign-in sessions: 30 days after you last used KaamSolv, or when you sign out.</li>
        <li>Sign-in links: 15 minutes, or until used.</li>
      </ul>

      <h2>Your choices and rights</h2>
      <p>
        If you have an account, you can delete any saved invoice yourself, and delete your whole account at{' '}
        <a href="/app/account">Account → Delete my account</a>. That removes your account, invoices, customers, items and business
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
        If we add something that changes what we collect (for example payments, analytics or ads), we&apos;ll
        update this page first and change the date at the top.
      </p>
    </TextPage>
  );
}
