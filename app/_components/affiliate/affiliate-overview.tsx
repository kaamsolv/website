'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { INPUT, PRIMARY, SECONDARY } from '@/app/_components/account/account-shell';
import { ACCENT } from '@/app/_components/accent';
import { Icon } from '@/app/_components/icons';
import { Skeleton } from '@/app/_components/skeleton';
import { portalLabel, programmeSlugFromInput } from '@/app/lib/affiliate/merchant';
import { useAffiliateNav, type StatusCounts } from '@/app/lib/affiliate/use-affiliate-nav';
import { ShareLinks } from './share-links';

const PANEL = 'rounded-xl2 border border-hair bg-surface p-5 sm:p-6';
const H2 = 'font-display text-xl font-extrabold tracking-tight text-ink';
const BODY = 'mt-2 max-w-prose text-strong';

/** A small figure with its label under it: the numbers a person comes back to check. */
function Figure({ n, label, href, testid, hot = false }: { n: number | string; label: string; href: string; testid: string; hot?: boolean }) {
  return (
    <Link href={href} data-testid={testid} className="group min-w-[5.5rem] rounded-lg px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
      <span className={`block font-display text-2xl font-extrabold leading-none ${hot ? 'text-coralx-600' : 'text-ink'}`}>{n}</span>
      <span className="mt-1 block text-sm text-muted underline-offset-2 group-hover:underline">{label}</span>
    </Link>
  );
}

const STEPS = [
  { title: 'A business makes a programme page', text: 'Its logo, colour and terms, at kaamsolv.com/affiliate/its-name.' },
  { title: 'You apply from that page', text: 'Your name, where you’ll share it and a line about you.' },
  { title: 'The business approves you by hand', text: 'Nobody joins on their own. You see the answer here.' },
];

/**
 * The Affiliate page (/app/affiliate): what the two roles are, where you stand in each, and the next step for each.
 * One account can hold both. Says only what exists today; what is still to come is marked as such.
 */
export function AffiliateOverview() {
  const nav = useAffiliateNav();
  const router = useRouter();
  const [pasted, setPasted] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const purple = ACCENT.purple;
  const teal = ACCENT.teal;

  function open(e: React.FormEvent) {
    e.preventDefault();
    const slug = programmeSlugFromInput(pasted);
    if (!slug) return setPasteError('That doesn’t look like a programme link. It looks like kaamsolv.com/affiliate/their-name.');
    router.push(`/affiliate/${slug}`);
  }

  const joined: StatusCounts | undefined = nav?.joined;
  const created = nav?.created;
  const joinedTotal = joined ? joined.pending + joined.approved + joined.rejected + joined.withdrawn : 0;

  return (
    <div className="space-y-8">
      <section aria-labelledby="how-h" className={PANEL}>
        <h2 id="how-h" className={H2}>
          How a programme works
        </h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative border-t-2 border-coral-500 pt-3">
              <span className="font-display text-sm font-extrabold text-coralx-600">Step {i + 1}</span>
              <p className="mt-1 font-semibold text-ink">{s.title}</p>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </li>
          ))}
          <li className="border-t-2 border-dashed border-hair pt-3" aria-label="Coming next">
            <span className="font-display text-sm font-extrabold text-muted">Next</span>
            <p className="mt-1 font-semibold text-strong">Your referral link and earnings</p>
            <p className="mt-1 text-sm text-muted">Not built yet. For now you can see where each application stands.</p>
          </li>
        </ol>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="joined-h" className={`${PANEL} flex flex-col`} data-testid="overview-joined">
          <div className="flex items-start gap-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${purple.tint} ${purple.fg}`}>
              <Icon name="affiliate" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 id="joined-h" className={H2}>
                Programmes joined
              </h2>
              <p className="text-sm text-muted">You promote other businesses.</p>
            </div>
          </div>
          <p className={BODY}>
            Pick a business you like, apply to its programme, and wait for its approval. Ask the business for the link to its programme page, or paste it below.
          </p>

          {!nav ? (
            <Skeleton className="mt-5 h-16" />
          ) : (
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3" aria-label="Your applications">
              <Figure n={joined!.pending} label="Applied" href="/app/affiliate/programmes?status=pending" testid="figure-applied" />
              <Figure n={joined!.approved} label="Approved" href="/app/affiliate/programmes?status=approved" testid="figure-approved" />
              <Figure n={joined!.rejected} label="Not approved" href="/app/affiliate/programmes?status=rejected" testid="figure-not-approved" />
            </div>
          )}

          <form onSubmit={open} className="mt-6 border-t border-hair pt-5" noValidate>
            <label htmlFor="paste-link" className="block text-sm font-bold text-ink">
              Have a programme link?
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="paste-link"
                value={pasted}
                onChange={(e) => {
                  setPasted(e.target.value);
                  setPasteError(null);
                }}
                className={`${INPUT} aria-invalid:border-danger-700 aria-invalid:ring-1 aria-invalid:ring-danger-700 sm:flex-1`}
                placeholder="Paste the programme link"
                inputMode="url"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={pasteError ? true : undefined}
                aria-describedby={pasteError ? 'paste-error' : undefined}
              />
              <button type="submit" className={PRIMARY}>
                Open programme
              </button>
            </div>
            {pasteError && (
              <p id="paste-error" role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-danger-700">
                <span aria-hidden="true" className="font-bold">!</span>
                <span>{pasteError}</span>
              </p>
            )}
          </form>

          <div className="mt-auto pt-5">
            <Link href="/app/affiliate/programmes" className={SECONDARY} data-testid="see-joined">
              {joinedTotal > 0 ? `See my programmes (${joinedTotal})` : 'See my programmes'}
            </Link>
          </div>
        </section>

        <section aria-labelledby="created-h" className={`${PANEL} flex flex-col`} data-testid="overview-created">
          <div className="flex items-start gap-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${teal.tint} ${teal.fg}`}>
              <Icon name="business" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 id="created-h" className={H2}>
                Programmes created
              </h2>
              <p className="text-sm text-muted">Other people promote your business.</p>
            </div>
          </div>
          <p className={BODY}>
            Make a page for your own programme with your logo, colour and terms. Open registration when you’re ready, then approve each person by hand.
          </p>

          {!nav ? (
            <Skeleton className="mt-5 h-24" />
          ) : created ? (
            <>
              <div className="mt-5 rounded-lg border border-hair bg-wash px-4 py-3">
                <p className="break-words font-semibold text-ink">{created.name}</p>
                <p className="mt-0.5 break-all text-sm text-muted">{portalLabel(created.slug)}</p>
                <p className="mt-2 text-sm text-strong" data-testid="registration-state">
                  Registration is <span className="font-bold">{created.registration === 'open' ? 'open' : 'closed'}</span>
                  {created.registration === 'closed' ? '. Open it from Applications when you’re ready.' : '.'}
                </p>
              </div>
              <ShareLinks slug={created.slug} className="mt-4" />
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3" aria-label="Applications to your programme">
                <Figure n={created.counts.pending} label="To review" href="/app/affiliate/applications?status=pending" testid="figure-to-review" hot={created.counts.pending > 0} />
                <Figure n={created.counts.approved} label="Approved" href="/app/affiliate/applications?status=approved" testid="figure-created-approved" />
                <Figure n={created.counts.rejected} label="Not approved" href="/app/affiliate/applications?status=rejected" testid="figure-created-not-approved" />
              </div>
              <div className="mt-auto flex flex-wrap gap-3 pt-5">
                <Link href="/app/affiliate/applications?status=pending" className={created.counts.pending > 0 ? PRIMARY : SECONDARY}>
                  Review applications
                </Link>
                <Link href="/app/affiliate/portal" className={SECONDARY}>
                  Portal settings
                </Link>
                <Link href={`/affiliate/${created.slug}`} target="_blank" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-2">
                  View my portal
                </Link>
              </div>
            </>
          ) : (
            <>
              <ul className="mt-5 list-disc space-y-2 pl-5 text-sm text-strong marker:text-coral-500">
                <li>Add your logo, colour and terms.</li>
                <li>Open registration and share your programme link.</li>
                <li>Approve or decline each application. Applicants only join when you say so.</li>
              </ul>
              <div className="mt-auto pt-5">
                <Link href="/app/affiliate/portal" className={PRIMARY} data-testid="create-programme">
                  Create my programme
                </Link>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
