'use client';

import { useEffect } from 'react';
import AdSlot from './components/AdSlot';

const POPULAR_TOOLS = [
  { name: 'GST Calculator', desc: 'Calculate GST, both ways, in seconds.', href: '/calculators/gst-calculator', accent: 'yellowx', icon: 'money' },
  { name: 'EMI Calculator', desc: 'Work out your monthly loan payment.', href: '/calculators/emi-calculator', accent: 'coralx', icon: 'money' },
  { name: 'Age Calculator', desc: 'Find your exact age, down to the day.', href: '/calculators/age-calculator', accent: 'tealx', icon: 'everyday' },
  { name: 'PDF to Word', desc: 'Turn a PDF into an editable document.', href: '/documents/pdf-to-word', accent: 'purplex', icon: 'documents' },
  { name: 'Invoice Generator', desc: 'Create a professional invoice, fast.', href: '/generators/invoice-generator', accent: 'coralx', icon: 'documents' },
  { name: 'Percentage Calculator', desc: "Do the maths once, not twice.", href: '/calculators/percentage-calculator', accent: 'tealx', icon: 'business' },
] as const;

const CATEGORIES = [
  { name: 'Money', desc: 'Calculate, compare, and figure out the numbers.', accent: 'yellowx', href: '/categories/money' },
  { name: 'Work', desc: 'Everyday tools to get work done faster.', accent: 'coralx', href: '/categories/work' },
  { name: 'Business', desc: 'Useful tools for running a small business.', accent: 'purplex', href: '/categories/business' },
  { name: 'Documents', desc: 'Create, edit, and convert your documents.', accent: 'purplex', href: '/categories/documents' },
  { name: 'Images & Files', desc: 'Resize, convert, and clean up your files.', accent: 'tealx', href: '/categories/images-files' },
  { name: 'Writing', desc: 'Write, count, and clean up text quickly.', accent: 'neutral', href: '/categories/writing' },
  { name: 'Career', desc: 'Tools for job hunts, resumes, and offers.', accent: 'tealx', href: '/categories/career' },
  { name: 'Everyday', desc: 'Small calculations for everyday life.', accent: 'yellowx', href: '/categories/everyday' },
  { name: 'India', desc: 'Tools built around everyday Indian needs.', accent: 'neutral', href: '/categories/india' },
  { name: 'Creators', desc: 'Useful tools for people who make things.', accent: 'coralx', href: '/categories/creators' },
] as const;

const FEATURES = [
  { title: 'Free to use', desc: 'Many everyday tools will always be free.' },
  { title: 'Built to be quick', desc: 'No unnecessary steps.' },
  { title: 'Made for real life', desc: 'Useful things people actually need.' },
  { title: 'No software degree required', desc: 'If you can use a form, you can use KaamKit.' },
] as const;

// Written as full literal class names (not template-string interpolation)
// on purpose: Tailwind's build-time scanner only picks up class names that
// appear as complete strings in the source — `bg-${accent}-100` would
// compile to nothing in production.
const ACCENT_CLASSES: Record<string, { bg: string; text: string }> = {
  yellowx: { bg: 'bg-yellowx-100', text: 'text-yellowx-600' },
  coralx: { bg: 'bg-coralx-100', text: 'text-coralx-600' },
  tealx: { bg: 'bg-tealx-100', text: 'text-tealx-600' },
  purplex: { bg: 'bg-purplex-100', text: 'text-purplex-600' },
  neutral: { bg: 'bg-chip', text: 'text-strong' },
};

function accentClasses(accent: string) {
  return ACCENT_CLASSES[accent] ?? ACCENT_CLASSES.neutral;
}

// Small, consistent outline-icon set. Kept as plain inline SVG so it matches
// the icon language already established in the Phase 1 design system.
function Icon({ name, className = 'w-5 h-5' }: { name: string; className?: string }) {
  const common = { className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 } as const;
  switch (name) {
    case 'money': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5c0-1.5 1.2-2.5 2.5-2.5s2.5.8 2.5 2c0 3-5 2-5 5 0 1.2 1.2 2 2.5 2s2.5-1 2.5-2.5" /></svg>;
    case 'work': return <svg {...common}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 12h18" /></svg>;
    case 'business': return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M20 20H4" /></svg>;
    case 'documents': return <svg {...common}><path d="M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>;
    case 'images': return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M3 17l5-5 4 4 3-3 6 6" /></svg>;
    case 'writing': return <svg {...common}><path d="M4 20l1-4L16 5l3 3L8 19l-4 1z" /><path d="M14 7l3 3" /></svg>;
    case 'career': return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" /></svg>;
    case 'everyday': return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
    case 'india': return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M3 14h18" /></svg>;
    case 'creators': return <svg {...common}><rect x="3" y="7" width="18" height="13" rx="2" /><circle cx="12" cy="13.5" r="3.5" /><path d="M8 7l1.5-2h5L16 7" /></svg>;
    case 'search': return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
    case 'lightning': return <svg {...common}><path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z" /></svg>;
    case 'clock': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>;
    case 'heart': return <svg {...common}><path d="M12 20s-7-4.3-9.5-8.5C1 8 2.5 5 6 5c2 0 3.3 1.1 4 2 0.7-0.9 2-2 4-2 3.5 0 5 3 3.5 6.5C19 15.7 12 20 12 20z" /></svg>;
    case 'smile': return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></svg>;
    case 'toolbox': return <svg {...common}><rect x="2.5" y="9" width="19" height="11" rx="1.5" /><path d="M8 9V6a2 2 0 012-2h4a2 2 0 012 2v3M2.5 13.5h19" /><path d="M11 12.5h2v2h-2z" /></svg>;
    default: return null;
  }
}

export default function HomePage() {
  useEffect(() => {
    const THEME_KEY = 'kaamkit-theme';
    function applyTheme(pref: string) {
      const root = document.documentElement;
      if (pref === 'system') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', pref);
      document.querySelectorAll<HTMLElement>('.theme-btn').forEach((b) =>
        b.setAttribute('aria-pressed', String(b.dataset.theme === pref))
      );
    }
    document.querySelectorAll<HTMLElement>('.theme-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pref = btn.dataset.theme || 'system';
        localStorage.setItem(THEME_KEY, pref);
        applyTheme(pref);
      });
    });
    applyTheme(localStorage.getItem(THEME_KEY) || 'system');

    const mobileBtn = document.getElementById('mobileNavBtn');
    const mobileNav = document.getElementById('mobileNav');
    const onMobileBtnClick = () => {
      const open = mobileNav?.classList.toggle('hidden') === false;
      mobileBtn?.setAttribute('aria-expanded', String(open));
    };
    mobileBtn?.addEventListener('click', onMobileBtnClick);
  }, []);

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>

      {/* HEADER */}
      <header className="site-header sticky top-0 z-50 backdrop-blur border-b border-hair">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a href="/" className="flex items-baseline gap-2 shrink-0" aria-label="KaamKit home">
            <span className="font-display font-800 text-2xl text-ink">Kaam<span className="text-coral-500">Kit</span></span>
          </a>

          <nav className="hidden lg:flex items-center gap-1 text-sm font-medium text-strong" aria-label="Primary">
            <a href="/tools" className="px-3 py-2 rounded-lg hover:bg-wash">Tools</a>
            <a href="#categories" className="px-3 py-2 rounded-lg hover:bg-wash">Categories</a>
            <a href="/about" className="px-3 py-2 rounded-lg hover:bg-wash">About</a>
          </nav>

          <div className="flex-1 max-w-md hidden md:block">
            <label className="relative block">
              <span className="sr-only">Search for a tool</span>
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"><Icon name="search" className="w-4 h-4" /></span>
              <input type="search" placeholder="Search for a tool…" className="w-full pl-9 pr-3 h-10 rounded-full bg-wash border border-transparent text-sm text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:bg-surface" />
            </label>
          </div>

          <div role="group" aria-label="Colour theme" className="hidden sm:inline-flex items-center bg-wash rounded-full p-1 gap-0.5 shrink-0">
            <button className="theme-btn w-8 h-8 rounded-full grid place-items-center text-faint" data-theme="light" aria-pressed="false" aria-label="Light theme">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            </button>
            <button className="theme-btn w-8 h-8 rounded-full grid place-items-center text-faint" data-theme="dark" aria-pressed="false" aria-label="Dark theme">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 12.5A8.5 8.5 0 1 1 11.5 3 7 7 0 0 0 21 12.5z" /></svg>
            </button>
            <button className="theme-btn w-8 h-8 rounded-full grid place-items-center text-faint" data-theme="system" aria-pressed="true" aria-label="Match system">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="13" rx="1" /><path d="M8 21h8M12 17v4" /></svg>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a href="/login" className="hidden sm:inline-block text-sm font-medium text-strong px-3 py-2 rounded-lg hover:bg-wash">Log in</a>
            <a href="/suggest-a-tool" className="inline-flex items-center h-10 px-4 rounded-full bg-coral-500 text-navy-900 text-sm font-semibold hover:bg-coral-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-coral-500 transition-colors">Suggest a Tool</a>
            <button id="mobileNavBtn" className="lg:hidden w-10 h-10 grid place-items-center rounded-lg hover:bg-wash" aria-expanded="false" aria-controls="mobileNav" aria-label="Open menu">
              <svg className="w-5 h-5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          </div>
        </div>
        <div id="mobileNav" className="hidden lg:hidden border-t border-hair px-4 sm:px-6 py-3 space-y-1 bg-surface">
          <a href="/tools" className="block px-3 py-2 rounded-lg hover:bg-wash text-sm font-medium text-strong">Tools</a>
          <a href="#categories" className="block px-3 py-2 rounded-lg hover:bg-wash text-sm font-medium text-strong">Categories</a>
          <a href="/about" className="block px-3 py-2 rounded-lg hover:bg-wash text-sm font-medium text-strong">About</a>
          <a href="/login" className="block px-3 py-2 rounded-lg hover:bg-wash text-sm font-medium text-strong">Log in</a>
        </div>
      </header>

      <main id="main">
        {/* HERO */}
        <section className="bg-wash">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16 grid lg:grid-cols-[1fr_320px] gap-10 items-center">
            <div>
              <h1 className="font-display font-800 text-3xl sm:text-4xl lg:text-5xl text-ink mb-3 leading-tight">
                What do you need to <span className="text-coral-500">get done</span>?
              </h1>
              <p className="text-muted text-base sm:text-lg mb-6 max-w-xl">
                Small tools for everyday problems. Calculate, convert, create and get on with your day.
              </p>
              <form className="flex flex-col sm:flex-row gap-2 max-w-xl mb-4" role="search" aria-label="Search KaamKit">
                <label className="relative flex-1">
                  <span className="sr-only">Search for a tool</span>
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-faint"><Icon name="search" className="w-5 h-5" /></span>
                  <input type="search" placeholder="Search for a tool…" className="w-full h-14 pl-12 pr-4 rounded-full border border-hair bg-fieldbg text-ink placeholder:text-faint text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500" />
                </label>
                <button type="submit" className="h-14 px-7 rounded-full bg-coral-500 text-navy-900 text-sm font-semibold hover:bg-coral-600 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-coral-500">
                  Search
                </button>
              </form>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="text-faint">Popular searches:</span>
                {POPULAR_TOOLS.slice(0, 5).map((t) => (
                  <a key={t.name} href={t.href} className="text-coral-600 hover:underline">{t.name}</a>
                ))}
              </div>
            </div>

            {/* Decorative sticky-note panel — original graphic, not a copy of any reference image */}
            <div className="hidden lg:flex flex-col items-center gap-4 relative">
              <div className="-rotate-3 bg-yellow-500 text-navy-900 rounded-xl shadow-soft px-5 py-4 w-56 self-start">
                <p style={{ fontFamily: 'var(--font-hand)' }} className="text-2xl leading-tight font-700">
                  Small problems.<br />Less kaam.
                </p>
              </div>
              <div className="w-24 h-24 rounded-2xl bg-surface border border-hair grid place-items-center text-purple-500 rotate-2 shadow-soft">
                <Icon name="toolbox" className="w-12 h-12" />
              </div>
              <p style={{ fontFamily: 'var(--font-hand)' }} className="rotate-2 text-2xl text-coral-600 font-700 self-end pr-4">
                Work smart.
              </p>
            </div>
          </div>
        </section>

        {/* POPULAR RIGHT NOW */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <div className="flex items-end justify-between mb-5">
            <h2 className="font-display font-800 text-2xl text-ink">Popular right now</h2>
            <a href="/tools" className="text-sm font-semibold text-coral-600 hover:underline hidden sm:inline">View all tools →</a>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {POPULAR_TOOLS.map((t) => {
              const a = accentClasses(t.accent);
              return (
                <a key={t.name} href={t.href} className="rounded-xl2 border border-hair bg-surface p-5 hover:shadow-lift transition-shadow">
                  <div className={`w-10 h-10 rounded-xl ${a.bg} ${a.text} grid place-items-center mb-3`}>
                    <Icon name={t.icon} className="w-5 h-5" />
                  </div>
                  <p className="font-display font-700 text-ink">{t.name}</p>
                  <p className="text-sm text-muted mt-1">{t.desc}</p>
                </a>
              );
            })}
          </div>
          <a href="/tools" className="text-sm font-semibold text-coral-600 hover:underline sm:hidden mt-5 inline-block">View all tools →</a>
        </section>

        {/* FIND YOUR TOOL — CATEGORIES */}
        <section id="categories" className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <h2 className="font-display font-800 text-2xl text-ink mb-1">Find your tool</h2>
          <p className="text-muted mb-6">From money and work to documents and everyday calculations.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {CATEGORIES.map((c) => {
              const a = accentClasses(c.accent);
              const iconKey = c.name === 'Images & Files' ? 'images' : c.name.toLowerCase();
              return (
                <a key={c.name} href={c.href} className={`rounded-xl2 p-5 ${a.bg} hover:shadow-soft transition-shadow`}>
                  <div className={`w-9 h-9 rounded-lg bg-surface ${a.text} grid place-items-center mb-3`}>
                    <Icon name={iconKey} className="w-5 h-5" />
                  </div>
                  <p className="font-display font-700 text-ink">{c.name}</p>
                  <p className="text-sm text-muted mt-1">{c.desc}</p>
                </a>
              );
            })}
          </div>
        </section>

        {/* BRAND STORY */}
        <section className="bg-wash">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16 grid lg:grid-cols-[1fr_280px] gap-10 items-center">
            <div>
              <h2 className="font-display font-800 text-2xl sm:text-3xl text-ink mb-3">
                Small problem? There&apos;s probably a tool for that.
              </h2>
              <p className="text-muted mb-3 max-w-xl">
                KaamKit is a growing collection of simple tools for the little things that get in the way of getting things done.
              </p>
              <p className="text-muted max-w-xl">
                No complicated software. No learning curve. Find the tool. Do the thing. Move on.
              </p>
            </div>
            <div className="hidden lg:flex flex-wrap items-center justify-center gap-3">
              <span className="-rotate-6 bg-tealx-100 text-tealx-600 text-xs font-semibold rounded-lg px-3 py-2 shadow-soft" style={{ fontFamily: 'var(--font-hand)', fontSize: '1rem' }}>Calculate this?</span>
              <span className="rotate-3 bg-purplex-100 text-purplex-600 text-xs font-semibold rounded-lg px-3 py-2 shadow-soft" style={{ fontFamily: 'var(--font-hand)', fontSize: '1rem' }}>Convert that?</span>
              <div className="w-16 h-16 rounded-2xl bg-surface border border-hair grid place-items-center text-coral-500 shadow-soft">
                <Icon name="toolbox" className="w-9 h-9" />
              </div>
              <span className="-rotate-3 bg-yellowx-100 text-yellowx-600 text-xs font-semibold rounded-lg px-3 py-2 shadow-soft" style={{ fontFamily: 'var(--font-hand)', fontSize: '1rem' }}>Create an invoice?</span>
              <span className="rotate-6 bg-coralx-100 text-coralx-600 text-xs font-semibold rounded-lg px-3 py-2 shadow-soft" style={{ fontFamily: 'var(--font-hand)', fontSize: '1rem' }}>Sorted.</span>
            </div>
          </div>
        </section>

        {/* THREE STEPS */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <h2 className="font-display font-800 text-2xl text-ink mb-6">Three steps. That&apos;s it.</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { n: '01', t: 'Find it', d: 'Search for the thing you need.' },
              { n: '02', t: 'Do it', d: 'Enter your details, upload your file, or choose what you need.' },
              { n: '03', t: 'Done', d: 'Get your result and get on with your day.' },
            ].map((s) => (
              <div key={s.n} className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-chip text-strong font-display font-700 grid place-items-center shrink-0">{s.n}</div>
                <div>
                  <p className="font-display font-700 text-ink">{s.t}</p>
                  <p className="text-sm text-muted mt-1">{s.d}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-10 pt-10 border-t border-hair">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-wash text-strong grid place-items-center shrink-0">
                  <Icon name={['lightning', 'clock', 'heart', 'smile'][i]} className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-display font-700 text-ink text-sm">{f.title}</p>
                  <p className="text-xs text-muted mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CLOSING CTA */}
        <section className="bg-coral-500">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-14 text-center">
            <h2 className="font-display font-800 text-2xl sm:text-3xl text-navy-900 mb-2">Got another small problem?</h2>
            <p className="text-navy-900/80 mb-6">There&apos;s a good chance we&apos;ve got a tool for it.</p>
            <a href="/tools" className="inline-flex items-center h-12 px-7 rounded-full bg-navy-900 text-white text-sm font-semibold hover:bg-navy-700 transition-colors">
              Explore all tools →
            </a>
          </div>
        </section>

        {/* AD SLOT — one placement, above the footer. See app/components/AdSlot.tsx for how this becomes a real ad. */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <AdSlot
            slotId="home-footer-leaderboard"
            size="leaderboard"
            mode="house"
            houseAd={{
              eyebrow: 'From KaamKit',
              title: 'Track every link, not just shorten it.',
              body: 'KaamKit Pro adds full analytics, campaigns, and batch tools.',
              ctaLabel: 'See Pro',
              href: '/pricing',
            }}
          />
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-hair bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid sm:grid-cols-2 lg:grid-cols-5 gap-8">
          <div>
            <p className="font-display font-800 text-lg text-ink mb-1">Kaam<span className="text-coral-500">Kit</span></p>
            <p className="text-xs text-faint">Small tools. Less kaam.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink mb-3">Tools</p>
            <ul className="space-y-2 text-sm text-muted">
              <li><a href="/tools" className="hover:text-ink">All tools</a></li>
              <li><a href="/calculators" className="hover:text-ink">Calculators</a></li>
              <li><a href="/converters" className="hover:text-ink">Converters</a></li>
              <li><a href="/generators" className="hover:text-ink">Generators</a></li>
              <li><a href="/templates" className="hover:text-ink">Templates</a></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink mb-3">Categories</p>
            <ul className="space-y-2 text-sm text-muted">
              {CATEGORIES.slice(0, 5).map((c) => (
                <li key={c.name}><a href={c.href} className="hover:text-ink">{c.name}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink mb-3">Company</p>
            <ul className="space-y-2 text-sm text-muted">
              <li><a href="/about" className="hover:text-ink">About KaamKit</a></li>
              <li><a href="/contact" className="hover:text-ink">Contact</a></li>
              <li><a href="/feedback" className="hover:text-ink">Feedback</a></li>
              <li><a href="/suggest-a-tool" className="hover:text-ink">Suggest a Tool</a></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink mb-3">Legal</p>
            <ul className="space-y-2 text-sm text-muted">
              <li><a href="/privacy" className="hover:text-ink">Privacy Policy</a></li>
              <li><a href="/terms" className="hover:text-ink">Terms of Use</a></li>
              <li><a href="/cookies" className="hover:text-ink">Cookie Policy</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 border-t border-hair flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-faint">
          <p>© 2026 KaamKit. All rights reserved.</p>
          <p style={{ fontFamily: 'var(--font-hand)' }} className="text-base">Work smart.</p>
        </div>
      </footer>
    </>
  );
}
