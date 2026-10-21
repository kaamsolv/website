import type { Metadata } from 'next';
import { TextPage } from '../_components/text-page';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What KaamSolv collects, why, and what it never does. Most tools run in your browser and send us nothing.',
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
      intro="The short version: most KaamSolv tools run entirely in your browser and send us nothing. Where we do keep data, it's the minimum needed to make the tool work and keep it safe."
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
      </ul>

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
        <strong>We don&apos;t use cookies</strong>, and there are no advertising or analytics trackers on
        KaamSolv.
      </p>
      <p>
        If you pick light or dark mode, your browser remembers that choice on your device (in local storage).
        It never leaves your device and you can clear it in your browser settings.
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
          <strong>Neon</strong> hosts the URL Shortener&apos;s database, in Singapore.
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
      </ul>

      <h2>Your choices and rights</h2>
      <p>
        You can ask us what data we hold about you, ask us to correct it, or ask us to delete it. Because short
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
        If we add something that changes what we collect (for example accounts, analytics or ads), we&apos;ll
        update this page first and change the date at the top.
      </p>
    </TextPage>
  );
}
