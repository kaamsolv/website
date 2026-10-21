import type { Metadata } from 'next';
import { TextPage } from '../_components/text-page';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'The rules for using KaamSolv’s free tools, including what you can and can’t shorten.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <TextPage
      title="Terms"
      intro="The rules for using KaamSolv. They're short — please read them."
      updated="2026-10-21"
    >
      <h2>Using KaamSolv</h2>
      <p>
        KaamSolv (“we”, “us”) offers free online tools at kaamsolv.com. By using them you agree to these terms
        and to our <a href="/privacy">Privacy policy</a>. If you don&apos;t agree, please don&apos;t use the tools.
      </p>
      <p>
        The tools are free and need no account. We may change, limit or stop any tool at any time, including
        the number of things you can do in a period.
      </p>

      <h2>Short links</h2>
      <p>You&apos;re responsible for every link you shorten. Don&apos;t use the URL Shortener for:</p>
      <ul>
        <li>phishing, scams, fake log-in pages, or anything that tricks people;</li>
        <li>malware, viruses or harmful downloads;</li>
        <li>spam or unwanted bulk messages;</li>
        <li>anything illegal, including content that exploits children;</li>
        <li>harassment, hate, threats, or impersonating someone else;</li>
        <li>content that infringes someone else&apos;s rights;</li>
        <li>hiding the real destination of another short link.</li>
      </ul>
      <p>
        We may refuse to create a link, and we may disable or remove any link at any time, without notice —
        especially if it&apos;s reported or breaks these rules. Short links are anonymous: they can&apos;t be
        edited after they&apos;re made.
      </p>
      <p>
        Found a bad link? <a href="/report-link">Report it</a>.
      </p>

      <h2>Your files and content</h2>
      <p>
        Our image converters and QR Code Generator work in your browser, and your content stays yours. Only use
        files and content you have the right to use.
      </p>
      <p>
        Check every QR code with your own phone before you print or share it. A UPI QR code fills in payment
        details in a payment app — KaamSolv doesn&apos;t process or confirm payments.
      </p>

      <h2>Results and information</h2>
      <p>
        We work hard to make our tools accurate, but results are for general use and are not professional
        legal, tax, financial or medical advice. Check anything important before you rely on it.
      </p>

      <h2>No guarantees</h2>
      <p>
        KaamSolv is provided “as is”. We don&apos;t promise it will always be available, error-free, or right
        for your purpose.
      </p>

      <h2>Limit of liability</h2>
      <p>
        As far as the law allows, we&apos;re not responsible for any loss or damage that comes from using — or
        not being able to use — KaamSolv, including lost data, lost business, or any indirect loss.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms. When we do, we&apos;ll change the date at the top. If you keep using
        KaamSolv after that, you accept the new terms.
      </p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of India.</p>

      <h2>Contact</h2>
      <p>
        Questions about these terms? Email <a href="mailto:kaamsolv@gmail.com">kaamsolv@gmail.com</a>.
      </p>
    </TextPage>
  );
}
