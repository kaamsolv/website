import type { Metadata } from 'next';
import { TextPage } from '../_components/text-page';
import { LIVE_TOOL_COUNT } from '../lib/catalogue';

export const metadata: Metadata = {
  title: 'About',
  description:
    'KaamSolv is a growing toolbox for small everyday problems — quick, free tools that feel like help, not software.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <TextPage title="About KaamSolv" intro="Small problems, solved.">
      <h2>What we do</h2>
      <p>
        KaamSolv is a toolbox for the small jobs that eat up your day — shortening a link, making a QR code,
        turning an iPhone photo into a JPG. Each tool does one thing, on one screen, with nothing to install
        and no account needed.
      </p>
      <p>
        When you have a small problem, KaamSolv probably has a tool for it. And if it doesn&apos;t yet,{' '}
        <a href="/contact#suggest">tell us</a>.
      </p>

      <h2>How we build</h2>
      <ul>
        <li>
          <strong>Find it, do it, done.</strong> If a tool needs instructions, we haven&apos;t finished it yet.
        </li>
        <li>
          <strong>Your stuff stays yours.</strong> Wherever we can, tools run in your browser — your images and
          QR details never reach us. Read our <a href="/privacy">Privacy policy</a>.
        </li>
        <li>
          <strong>Free for everyday use.</strong> The everyday tools stay free, with no sign-up.
        </li>
        <li>
          <strong>One tool at a time.</strong> We&apos;d rather ship one tool that works properly than ten that
          half work.
        </li>
      </ul>

      <h2>Where we are</h2>
      <p>
        KaamSolv is new and made in India. {LIVE_TOOL_COUNT} tools are ready today, with more on the way.{' '}
        <a href="/tools">See all tools</a>.
      </p>

      <h2>Say hello</h2>
      <p>
        Ideas, feedback or a bug to report? <a href="/contact">Get in touch</a> — we read every message.
      </p>
    </TextPage>
  );
}
