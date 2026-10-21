import type { Metadata } from 'next';
import { CopyButton } from '../_components/copy-button';
import { Icon } from '../_components/icons';
import { TextPage } from '../_components/text-page';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Suggest a tool, send feedback, report a problem or ask about your data. We read every message.',
  alternates: { canonical: '/contact' },
};

const EMAIL = 'kaamsolv@gmail.com';

const mailto = (subject: string) => `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`;

/** Each reason has an anchor so other pages can link straight to it. */
const REASONS = [
  {
    id: 'suggest',
    title: 'Suggest a tool',
    body: 'Got a small problem we don’t solve yet? Tell us what you were trying to do.',
    cta: 'Suggest a tool',
    href: mailto('Tool suggestion'),
  },
  {
    id: 'feedback',
    title: 'Feedback or a bug',
    body: 'Something confusing, broken or just slow? Tell us which tool and what happened.',
    cta: 'Send feedback',
    href: mailto('Feedback'),
  },
  {
    id: 'report',
    title: 'Report a bad short link',
    body: 'Found a KaamSolv short link leading somewhere harmful? Report it and we’ll take a look.',
    cta: 'Report a link',
    href: '/report-link',
  },
  {
    id: 'privacy',
    title: 'Your data',
    body: 'Want to know what we hold, or want a short link you made taken down?',
    cta: 'Email about privacy',
    href: mailto('Privacy request'),
  },
];

export default function ContactPage() {
  return (
    <TextPage title="Contact" intro="One inbox, read by real people. Pick what you need, or just write to us.">
      <div className="flex flex-wrap items-center gap-3 rounded-xl2 border border-hair bg-surface p-5">
        <Icon name="mail" className="h-5 w-5 text-coral-600" />
        <a href={`mailto:${EMAIL}`} className="text-lg">
          {EMAIL}
        </a>
        <CopyButton value={EMAIL} label="Copy email" className="ml-auto" />
      </div>

      <ul className="!mt-8 !list-none !space-y-0 !pl-0 grid gap-4 sm:grid-cols-2">
        {REASONS.map((r) => (
          <li key={r.id} id={r.id} className="!mt-0 flex scroll-mt-24 flex-col rounded-xl2 border border-hair bg-surface p-5">
            <h2 className="!mt-0 !text-lg">{r.title}</h2>
            <p className="flex-1 text-sm text-muted">{r.body}</p>
            <a
              href={r.href}
              className="mt-4 inline-flex h-10 w-fit items-center rounded-full bg-coral-500 px-4 text-sm !text-navy-900 transition-colors hover:bg-coral-600 hover:!text-white hover:!no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2"
            >
              {r.cta}
            </a>
          </li>
        ))}
      </ul>
    </TextPage>
  );
}
