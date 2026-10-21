'use client';

import { useEffect } from 'react';

export default function DesignSystemPage() {
  useEffect(() => {
    // ---- Theme system: light / dark / system ----
    const THEME_KEY = 'kaamsolv-theme';
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

    // ---- Mobile public nav ----
    const mobileBtn = document.getElementById('mobileNavBtn');
    const mobileNav = document.getElementById('mobileNav');
    const onMobileBtnClick = () => {
      const open = mobileNav?.classList.toggle('hidden') === false;
      mobileBtn?.setAttribute('aria-expanded', String(open));
    };
    mobileBtn?.addEventListener('click', onMobileBtnClick);

    // ---- App sidebar toggle (mobile) ----
    const sidebar = document.getElementById('appSidebar');
    const sidebarToggle = document.getElementById('appSidebarToggle');
    const onSidebarToggle = () => {
      const isOpen = sidebar?.classList.toggle('open');
      sidebarToggle?.setAttribute('aria-expanded', String(!!isOpen));
    };
    sidebarToggle?.addEventListener('click', onSidebarToggle);

    // ---- Tabs ----
    document.querySelectorAll<HTMLElement>('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const group = btn.closest('[role="tablist"]');
        group?.querySelectorAll<HTMLElement>('.tab-btn').forEach((b) => {
          b.setAttribute('aria-selected', 'false');
          b.classList.remove('bg-surface', 'shadow-soft', 'text-ink');
          b.classList.add('text-muted');
        });
        btn.setAttribute('aria-selected', 'true');
        btn.classList.add('bg-surface', 'shadow-soft', 'text-ink');
        btn.classList.remove('text-muted');
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
        const target = btn.dataset.tab;
        if (target) document.getElementById(target)?.classList.add('active');
      });
    });

    // ---- Modal ----
    const modal = document.getElementById('exampleModal');
    const openModalBtn = document.getElementById('openModalBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const closeModal = () => {
      modal?.classList.add('hidden');
      openModalBtn?.focus();
    };
    const onOpenModal = () => {
      modal?.classList.remove('hidden');
      closeModalBtn?.focus();
    };
    openModalBtn?.addEventListener('click', onOpenModal);
    closeModalBtn?.addEventListener('click', closeModal);
    const onModalBackdropClick = (e: MouseEvent) => { if (e.target === modal) closeModal(); };
    modal?.addEventListener('click', onModalBackdropClick);
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !modal?.classList.contains('hidden')) closeModal();
    };
    document.addEventListener('keydown', onKeydown);

    // ---- Toast ----
    function fireToast(message: string, tone: 'success' | 'error' | 'info') {
      const region = document.getElementById('toast-region');
      const colors: Record<string, string> = { success: 'bg-teal-500', error: 'bg-red-600', info: 'bg-navy-900' };
      const el = document.createElement('div');
      el.className = `${colors[tone] || colors.info} text-white text-sm font-medium rounded-xl px-4 py-3 shadow-lift`;
      el.textContent = message;
      region?.appendChild(el);
      setTimeout(() => {
        el.style.transition = 'opacity .2s';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 200);
      }, 3000);
    }
    const fireToastBtn = document.getElementById('fireToastBtn');
    const onFireToast = () => fireToast('One less thing. Link copied.', 'success');
    fireToastBtn?.addEventListener('click', onFireToast);

    // ---- Copy buttons ----
    const copyBtns = document.querySelectorAll<HTMLElement>('.copy-btn');
    copyBtns.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const text = btn.dataset.copy || '';
        try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable */ }
        const flash = btn.querySelector('.copy-flash');
        flash?.classList.add('show');
        setTimeout(() => flash?.classList.remove('show'), 1200);
        fireToast('Copied to clipboard.', 'success');
      });
    });

    // ---- QR type picker (main section) ----
    document.querySelectorAll<HTMLElement>('.qr-type-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll<HTMLElement>('.qr-type-btn').forEach((b) => {
          b.classList.remove('bg-activebg', 'text-activetext', 'border-activebg');
          b.classList.add('border-hair', 'text-strong');
        });
        btn.classList.add('bg-activebg', 'text-activetext', 'border-activebg');
        btn.classList.remove('border-hair', 'text-strong');
        document.querySelectorAll('.qr-field-group').forEach((g) => g.classList.remove('active'));
        const type = btn.dataset.qr;
        if (type) document.getElementById('qr-' + type)?.classList.add('active');
      });
    });

    // ---- Filter chips + table filter ----
    const chips = document.querySelectorAll<HTMLElement>('.filter-chip');
    const rows = document.querySelectorAll<HTMLElement>('.table-row');
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chips.forEach((c) => c.setAttribute('aria-pressed', 'false'));
        chip.setAttribute('aria-pressed', 'true');
        const status = chip.dataset.status;
        rows.forEach((r) => { r.style.display = (status === 'all' || r.dataset.status === status) ? '' : 'none'; });
      });
    });
    const tableSearch = document.getElementById('tableSearch') as HTMLInputElement | null;
    const onTableSearch = (e: Event) => {
      const q = (e.target as HTMLInputElement).value.toLowerCase();
      rows.forEach((r) => { r.style.display = (r.textContent || '').toLowerCase().includes(q) ? '' : 'none'; });
    };
    tableSearch?.addEventListener('input', onTableSearch);

    // ---- Drop zones (visual only) ----
    const dropzones = document.querySelectorAll<HTMLElement>('.dropzone');
    const dragOver = (e: Event) => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add('drag-over'); };
    const dragOut = (e: Event) => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.remove('drag-over'); };
    dropzones.forEach((zone) => {
      zone.addEventListener('dragenter', dragOver);
      zone.addEventListener('dragover', dragOver);
      zone.addEventListener('dragleave', dragOut);
      zone.addEventListener('drop', dragOut);
    });

    // ---- File input demo ----
    const fileInput = document.getElementById('fileInput') as HTMLInputElement | null;
    const fileList = document.getElementById('fileList');
    const cardTpl = document.getElementById('fileCardTemplate') as HTMLTemplateElement | null;
    const onFileChange = () => {
      if (!fileInput?.files || !cardTpl || !fileList) return;
      [...fileInput.files].forEach((f) => {
        const node = cardTpl.content.cloneNode(true) as DocumentFragment;
        const nameEl = node.querySelector('.file-name');
        const metaEl = node.querySelector('.file-meta');
        const bar = node.querySelector('.progress-bar') as HTMLElement | null;
        if (nameEl) nameEl.textContent = f.name;
        if (metaEl) metaEl.textContent = (f.size / 1024 / 1024).toFixed(1) + ' MB';
        fileList.appendChild(node);
        let w = 0;
        const iv = setInterval(() => {
          w += 20;
          if (bar) bar.style.width = Math.min(w, 100) + '%';
          if (w >= 100) clearInterval(iv);
        }, 150);
        const lastCard = fileList.lastElementChild;
        lastCard?.querySelector('.remove-file')?.addEventListener('click', (e) => {
          (e.target as HTMLElement).closest('div.flex')?.remove();
        });
      });
    };
    fileInput?.addEventListener('change', onFileChange);

    // ---- Billing toggle ----
    const toggle = document.getElementById('billingToggle');
    const priceDisplay = document.getElementById('priceDisplay');
    const onBillingToggle = () => {
      const checked = toggle?.getAttribute('aria-checked') === 'true';
      toggle?.setAttribute('aria-checked', String(!checked));
      toggle?.classList.toggle('bg-activebg');
      toggle?.classList.toggle('bg-chip');
      toggle?.querySelector('span')?.classList.toggle('translate-x-5');
      if (priceDisplay) {
        priceDisplay.innerHTML = !checked
          ? '₹2,388<span class="text-sm font-normal text-muted">/yr</span>'
          : '₹299<span class="text-sm font-normal text-muted">/mo</span>';
      }
    };
    toggle?.addEventListener('click', onBillingToggle);

    // ---- Fluid demo: URL Shortener ----
    const urlDemoBtn = document.getElementById('urlDemoBtn');
    const urlDemoReset = document.getElementById('urlDemoReset');
    const urlStep1 = document.getElementById('urlStep1');
    const urlStep2 = document.getElementById('urlStep2');
    const urlDemoInput = document.getElementById('urlDemoInput') as HTMLInputElement | null;
    const onUrlDemo = () => { urlStep1?.classList.add('hidden'); urlStep2?.classList.remove('hidden'); };
    const onUrlReset = () => { urlStep2?.classList.add('hidden'); urlStep1?.classList.remove('hidden'); if (urlDemoInput) urlDemoInput.value = ''; };
    urlDemoBtn?.addEventListener('click', onUrlDemo);
    urlDemoReset?.addEventListener('click', onUrlReset);

    // ---- Fluid demo: QR ----
    const qrStep1 = document.getElementById('qrStep1');
    const qrStep2 = document.getElementById('qrStep2');
    const qrStep3 = document.getElementById('qrStep3');
    const qrDemoBtn = document.getElementById('qrDemoBtn');
    const qrDemoReset = document.getElementById('qrDemoReset');
    const onQrMini = () => { qrStep1?.classList.add('hidden'); qrStep2?.classList.remove('hidden'); };
    document.querySelectorAll('.qrmini-btn').forEach((btn) => btn.addEventListener('click', onQrMini));
    const onQrDemo = () => { qrStep2?.classList.add('hidden'); qrStep3?.classList.remove('hidden'); };
    qrDemoBtn?.addEventListener('click', onQrDemo);
    const onQrReset = () => { qrStep3?.classList.add('hidden'); qrStep1?.classList.remove('hidden'); };
    qrDemoReset?.addEventListener('click', onQrReset);

    // ---- Fluid demo: Image tool ----
    const imgStep1 = document.getElementById('imgStep1');
    const imgStep2 = document.getElementById('imgStep2');
    const imgStep3 = document.getElementById('imgStep3');
    const imgStep4 = document.getElementById('imgStep4');
    const imgDemoBtn = document.getElementById('imgDemoBtn');
    const imgDemoReset = document.getElementById('imgDemoReset');
    const onImgStep1Click = () => { imgStep1?.classList.add('hidden'); imgStep2?.classList.remove('hidden'); };
    imgStep1?.addEventListener('click', onImgStep1Click);
    const onImgDemo = () => {
      imgStep2?.classList.add('hidden');
      imgStep3?.classList.remove('hidden');
      setTimeout(() => { imgStep3?.classList.add('hidden'); imgStep4?.classList.remove('hidden'); }, 1200);
    };
    imgDemoBtn?.addEventListener('click', onImgDemo);
    const onImgReset = () => { imgStep4?.classList.add('hidden'); imgStep1?.classList.remove('hidden'); };
    imgDemoReset?.addEventListener('click', onImgReset);

    // Cleanup on unmount
    return () => {
      document.removeEventListener('keydown', onKeydown);
    };
  }, []);

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>

      {/* TOP STATUS BAR — always literal dark navy, like the app sidebar. */}
      <div className="bg-navy-900 text-white text-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-4">
          <p className="font-display font-semibold">KaamSolv Design System <span className="hidden sm:inline text-navy-300 font-sans font-normal">— Phase 1 reference build</span></p>
          <p className="text-navy-300 hidden md:block">Small tools. Less kaam.</p>
        </div>
      </div>

      {/* PUBLIC HEADER (component: nav.public) */}
      <header className="site-header sticky top-0 z-50 backdrop-blur border-b border-hair">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a href="#top" className="flex items-baseline gap-2 shrink-0" aria-label="KaamSolv home">
            <span className="font-display font-800 text-2xl text-ink">Kaam<span className="text-coral-500">Solv</span></span>
          </a>

          <nav className="hidden lg:flex items-center gap-1 text-sm font-medium text-strong" aria-label="Primary">
            <a href="#tool-cards" className="px-3 py-2 rounded-lg hover:bg-wash">Tools</a>
            <a href="#categories" className="px-3 py-2 rounded-lg hover:bg-wash">Categories</a>
            <a href="#" className="px-3 py-2 rounded-lg hover:bg-wash">Suggest a tool</a>
          </nav>

          <div className="flex-1 max-w-md hidden md:block">
            <label className="relative block">
              <span className="sr-only">Search for a tool</span>
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
              <input type="search" placeholder="Search for a tool…" className="w-full pl-9 pr-3 h-10 rounded-full bg-wash border border-transparent text-sm text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:bg-surface" />
            </label>
          </div>

          {/* Theme switcher */}
          <div role="group" aria-label="Colour theme" className="hidden sm:inline-flex items-center bg-wash rounded-full p-1 gap-0.5 shrink-0">
            <button className="theme-btn w-8 h-8 rounded-full grid place-items-center text-faint" data-theme="light" aria-pressed="false" aria-label="Light theme">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
            </button>
            <button className="theme-btn w-8 h-8 rounded-full grid place-items-center text-faint" data-theme="dark" aria-pressed="false" aria-label="Dark theme">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.5A8.5 8.5 0 1 1 11.5 3 7 7 0 0 0 21 12.5z"/></svg>
            </button>
            <button className="theme-btn w-8 h-8 rounded-full grid place-items-center text-faint" data-theme="system" aria-pressed="true" aria-label="Match system">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="13" rx="1"/><path d="M8 21h8M12 17v4"/></svg>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a href="#" className="hidden sm:inline-block text-sm font-medium text-strong px-3 py-2 rounded-lg hover:bg-wash">Log in</a>
            <a href="#" className="inline-flex items-center h-10 px-4 rounded-full bg-coral-500 text-navy-900 text-sm font-semibold hover:bg-coral-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-coral-500 transition-colors">Get started</a>
            <button id="mobileNavBtn" className="lg:hidden w-10 h-10 grid place-items-center rounded-lg hover:bg-wash" aria-expanded="false" aria-controls="mobileNav" aria-label="Open menu">
              <svg className="w-5 h-5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
          </div>
        </div>
        <div id="mobileNav" className="hidden lg:hidden border-t border-hair px-4 sm:px-6 py-3 space-y-1 bg-surface">
          <a href="#tool-cards" className="block px-3 py-2 rounded-lg hover:bg-wash text-sm font-medium text-strong">Tools</a>
          <a href="#categories" className="block px-3 py-2 rounded-lg hover:bg-wash text-sm font-medium text-strong">Categories</a>
          <a href="#" className="block px-3 py-2 rounded-lg hover:bg-wash text-sm font-medium text-strong">Suggest a tool</a>
          <a href="#" className="block px-3 py-2 rounded-lg hover:bg-wash text-sm font-medium text-strong">Log in</a>
          <div role="group" aria-label="Colour theme" className="flex items-center gap-2 pt-2">
            <button className="theme-btn flex-1 h-9 rounded-lg text-xs font-semibold border border-hair text-strong" data-theme="light" aria-pressed="false">Light</button>
            <button className="theme-btn flex-1 h-9 rounded-lg text-xs font-semibold border border-hair text-strong" data-theme="dark" aria-pressed="false">Dark</button>
            <button className="theme-btn flex-1 h-9 rounded-lg text-xs font-semibold border border-hair text-strong" data-theme="system" aria-pressed="true">System</button>
          </div>
        </div>
      </header>

      <div id="top"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex gap-8">
        <aside className="hidden xl:block w-56 shrink-0">
          <nav className="sticky top-24 text-sm space-y-1" aria-label="Design system sections">
            <a href="#principles" className="block px-3 py-1.5 rounded-lg text-strong hover:bg-wash">Principles</a>
            <a href="#foundations" className="block px-3 py-1.5 rounded-lg text-strong hover:bg-wash">Foundations &amp; theme</a>
            <a href="#buttons" className="block px-3 py-1.5 rounded-lg text-strong hover:bg-wash">Buttons</a>
            <a href="#forms" className="block px-3 py-1.5 rounded-lg text-strong hover:bg-wash">Forms &amp; inputs</a>
            <a href="#tool-cards" className="block px-3 py-1.5 rounded-lg text-strong hover:bg-wash">Cards &amp; tool cards</a>
            <a href="#tabs-badges" className="block px-3 py-1.5 rounded-lg text-strong hover:bg-wash">Tabs, badges, tooltips</a>
            <a href="#modals-alerts" className="block px-3 py-1.5 rounded-lg text-strong hover:bg-wash">Modals &amp; notifications</a>
            <a href="#upload" className="block px-3 py-1.5 rounded-lg text-strong hover:bg-wash">Upload &amp; files</a>
            <a href="#results" className="block px-3 py-1.5 rounded-lg text-strong hover:bg-wash">Result components</a>
            <a href="#qr" className="block px-3 py-1.5 rounded-lg text-strong hover:bg-wash">QR components <span className="text-faint">(provisional)</span></a>
            <a href="#analytics" className="block px-3 py-1.5 rounded-lg text-strong hover:bg-wash">Analytics, charts, tables</a>
            <a href="#states" className="block px-3 py-1.5 rounded-lg text-strong hover:bg-wash">States</a>
            <a href="#app-shell" className="block px-3 py-1.5 rounded-lg text-strong hover:bg-wash">App dashboard shell</a>
            <a href="#pricing" className="block px-3 py-1.5 rounded-lg text-strong hover:bg-wash">Pricing</a>
            <a href="#fluid-demos" className="block px-3 py-1.5 rounded-lg text-strong hover:bg-wash">Fluid tool UX demos</a>
            <a href="#categories" className="block px-3 py-1.5 rounded-lg text-strong hover:bg-wash">Categories &amp; catalogue</a>
          </nav>
        </aside>

        <main id="main" className="flex-1 min-w-0 space-y-20">
          <section id="principles">
            <h1 className="font-display font-800 text-3xl sm:text-4xl text-ink mb-3">Don&apos;t make a tool feel like software. Make it feel like help.</h1>
            <p className="text-muted max-w-2xl mb-6">Every component below follows the same rule: show what&apos;s needed, hide what isn&apos;t, and reveal more only once the person has told you what they&apos;re trying to do.</p>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="rounded-xl2 border border-hair bg-surface p-5">
                <p className="font-display font-700 text-ink mb-1">Progressive disclosure</p>
                <p className="text-sm text-muted">Start with one field. Add options only after the basics are done.</p>
              </div>
              <div className="rounded-xl2 border border-hair bg-surface p-5">
                <p className="font-display font-700 text-ink mb-1">One brand, two shells</p>
                <p className="text-sm text-muted">Public tools and the logged-in app share components — the app just adds a sidebar.</p>
              </div>
              <div className="rounded-xl2 border border-hair bg-surface p-5">
                <p className="font-display font-700 text-ink mb-1">Light and dark, one identity</p>
                <p className="text-sm text-muted">Dark mode changes the surfaces, never the brand hues.</p>
              </div>
            </div>
          </section>

          {/* FOUNDATIONS + THEME */}
          <section id="foundations">
            <h2 className="font-display font-800 text-2xl text-ink mb-1">1. Foundations &amp; theme system</h2>
            <p className="text-muted mb-6">Semantic tokens — a role like &quot;primary text&quot; or &quot;card surface&quot; resolves to a different literal colour per theme. Brand hues themselves don&apos;t move. Try the Light / Dark / System switcher in the header.</p>

            <h3 className="font-display font-700 text-ink mb-3">Brand hues — constant in every theme</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-8">
              <div className="rounded-xl2 overflow-hidden border border-hair">
                <div className="h-16 bg-navy-900"></div>
                <div className="p-3 bg-surface text-xs"><p className="font-semibold text-ink">Deep Navy</p><p className="text-muted">#0C2248</p></div>
              </div>
              <div className="rounded-xl2 overflow-hidden border border-hair">
                <div className="h-16 bg-coral-500"></div>
                <div className="p-3 bg-surface text-xs"><p className="font-semibold text-ink">Coral</p><p className="text-muted">#FE6336</p></div>
              </div>
              <div className="rounded-xl2 overflow-hidden border border-hair">
                <div className="h-16 bg-yellow-500"></div>
                <div className="p-3 bg-surface text-xs"><p className="font-semibold text-ink">Yellow</p><p className="text-muted">#FDBD43</p></div>
              </div>
              <div className="rounded-xl2 overflow-hidden border border-hair">
                <div className="h-16 bg-teal-500"></div>
                <div className="p-3 bg-surface text-xs"><p className="font-semibold text-ink">Teal</p><p className="text-muted">#38BBAC</p></div>
              </div>
              <div className="rounded-xl2 overflow-hidden border border-hair">
                <div className="h-16 bg-purple-500"></div>
                <div className="p-3 bg-surface text-xs"><p className="font-semibold text-ink">Purple</p><p className="text-muted">#6934D0</p></div>
              </div>
            </div>

            <h3 className="font-display font-700 text-ink mb-3">Semantic surface &amp; text tokens — flip this page&apos;s theme to watch these change</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8 text-xs">
              <div className="rounded-xl border border-hair bg-canvas p-4"><p className="font-semibold text-ink">canvas</p><p className="text-muted">page background</p></div>
              <div className="rounded-xl border border-hair bg-surface p-4"><p className="font-semibold text-ink">surface</p><p className="text-muted">card / panel background</p></div>
              <div className="rounded-xl border border-hair bg-raised p-4"><p className="font-semibold text-ink">raised</p><p className="text-muted">modal / popover background</p></div>
              <div className="rounded-xl border border-hair bg-wash p-4"><p className="font-semibold text-ink">wash</p><p className="text-muted">hover / track background</p></div>
              <div className="rounded-xl border border-hair bg-surface p-4"><p className="text-ink font-semibold">ink</p><p className="text-muted">primary text</p></div>
              <div className="rounded-xl border border-hair bg-surface p-4"><p className="text-strong font-semibold">strong</p><p className="text-muted">secondary emphasis text</p></div>
              <div className="rounded-xl border border-hair bg-surface p-4"><p className="text-muted font-semibold">muted</p><p className="text-muted">body / help text</p></div>
              <div className="rounded-xl border border-hair bg-surface p-4"><p className="text-faint font-semibold">faint</p><p className="text-muted">icons, placeholders</p></div>
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <h3 className="font-display font-700 text-ink mb-3">Type scale</h3>
                <div className="space-y-2 bg-surface border border-hair rounded-xl2 p-5">
                  <p className="font-display font-800 text-3xl text-ink">Aa — Sora 800</p>
                  <p className="font-display font-700 text-xl text-ink">Aa — Sora 700, section heads</p>
                  <p className="font-sans font-600 text-base text-ink">Aa — Inter 600, labels &amp; UI</p>
                  <p className="font-sans font-normal text-base text-ink">Aa — Inter 400, body copy</p>
                  <p className="font-sans font-normal text-sm text-muted">Aa — Inter 400, help &amp; meta text</p>
                </div>
              </div>
              <div>
                <h3 className="font-display font-700 text-ink mb-3">Spacing, radius, elevation</h3>
                <div className="bg-surface border border-hair rounded-xl2 p-5 text-sm text-muted space-y-2">
                  <p><span className="font-semibold text-ink">4·8·12·16·24·32·48px</span> spacing scale</p>
                  <p><span className="font-semibold text-ink">rounded-lg</span> inputs/buttons · <span className="font-semibold text-ink">rounded-xl2</span> cards · <span className="font-semibold text-ink">rounded-full</span> primary CTA only</p>
                  <p><span className="font-semibold text-ink">shadow-soft</span> resting · <span className="font-semibold text-ink">shadow-lift</span> hover/active</p>
                  <p>Breakpoints: mobile default → <span className="font-semibold text-ink">sm 640 · md 768 · lg 1024 · xl 1280</span></p>
                </div>
              </div>
            </div>
          </section>

          {/* BUTTONS */}
          <section id="buttons">
            <h2 className="font-display font-800 text-2xl text-ink mb-1">2. Buttons</h2>
            <p className="text-muted mb-6">One pill-shaped primary action per screen. The primary button keeps navy text on coral in both themes — a fixed, high-contrast pair, not something that inverts with the page.</p>
            <div className="bg-surface border border-hair rounded-xl2 p-6 space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <button className="h-11 px-5 rounded-full bg-coral-500 text-navy-900 text-sm font-semibold hover:bg-coral-600 hover:text-white active:bg-coral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-coral-500 transition-colors">Shorten it</button>
                <button className="h-11 px-5 rounded-lg border border-ink text-ink text-sm font-semibold hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ink transition-colors">Secondary action</button>
                <button className="h-11 px-5 rounded-lg text-strong text-sm font-semibold hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink transition-colors">Ghost / tertiary</button>
                <button className="h-11 px-5 rounded-lg bg-danger-50 text-danger-700 text-sm font-semibold hover:bg-danger-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-600 transition-colors">Delete link</button>
                <button disabled className="h-11 px-5 rounded-full bg-chip text-faint text-sm font-semibold cursor-not-allowed">Shorten it</button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button className="h-9 px-4 rounded-full bg-coral-500 text-navy-900 text-xs font-semibold">Small</button>
                <button className="h-11 px-5 rounded-full bg-coral-500 text-navy-900 text-sm font-semibold">Default (44px — touch target)</button>
                <button className="h-14 px-6 rounded-full bg-coral-500 text-navy-900 text-base font-semibold">Large</button>
                <button className="h-11 px-5 rounded-full bg-coral-500 text-navy-900 text-sm font-semibold inline-flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".3"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
                  Converting…
                </button>
              </div>
            </div>
          </section>

          {/* FORMS */}
          <section id="forms">
            <h2 className="font-display font-800 text-2xl text-ink mb-1">3. Forms &amp; inputs</h2>
            <p className="text-muted mb-6">Labels always visible, help text always present, errors always specific.</p>
            <div className="bg-surface border border-hair rounded-xl2 p-6 grid sm:grid-cols-2 gap-6">
              <div>
                <label htmlFor="fUrl" className="block text-sm font-semibold text-ink mb-1.5">Paste your URL</label>
                <input id="fUrl" type="url" placeholder="https://your-long-link.com/goes-here" className="w-full h-12 px-4 rounded-lg border border-hair bg-fieldbg text-ink placeholder:text-faint text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:border-transparent" />
                <p className="text-xs text-muted mt-1.5">We&apos;ll turn this into a short kaamsolv.com link.</p>
              </div>
              <div>
                <label htmlFor="fSlug" className="block text-sm font-semibold text-ink mb-1.5">Custom slug (optional)</label>
                <div className="flex items-center h-12 rounded-lg border border-hair bg-fieldbg overflow-hidden focus-within:ring-2 focus-within:ring-coral-500">
                  <span className="pl-4 text-sm text-muted shrink-0">kaamsolv.com/</span>
                  <input id="fSlug" type="text" placeholder="menu2025" className="flex-1 h-full pr-4 bg-fieldbg text-ink placeholder:text-faint text-sm focus-visible:outline-none" />
                </div>
              </div>
              <div>
                <label htmlFor="fNum" className="block text-sm font-semibold text-ink mb-1.5">Quality (numeric field)</label>
                <input id="fNum" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue="80" className="w-full h-12 px-4 rounded-lg border border-hair bg-fieldbg text-ink text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500" />
                <p className="text-xs text-muted mt-1.5">Numeric-string field — validated on blur, not on every keystroke.</p>
              </div>
              <div>
                <label htmlFor="fBad" className="block text-sm font-semibold text-ink mb-1.5">Email</label>
                <input id="fBad" type="email" defaultValue="not-an-email" aria-invalid="true" aria-describedby="fBadErr" className="w-full h-12 px-4 rounded-lg border border-danger-400 bg-danger-50 text-ink text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-600" />
                <p id="fBadErr" role="alert" className="text-xs text-danger-700 mt-1.5 font-medium">That doesn&apos;t look like a valid email. Try name@example.com.</p>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="fQuality" className="block text-sm font-semibold text-ink mb-1.5">Compression <span className="text-muted font-normal">— slider (touch-tested, 44px thumb target)</span></label>
                <input id="fQuality" type="range" min="0" max="100" defaultValue="70" className="w-full h-11 accent-coral-500" />
                <div className="flex justify-between text-xs text-muted"><span>Smaller file</span><span>Higher quality</span></div>
              </div>
              <div>
                <label htmlFor="fSelect" className="block text-sm font-semibold text-ink mb-1.5">Output format</label>
                <select id="fSelect" className="w-full h-12 px-4 rounded-lg border border-hair bg-fieldbg text-ink text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
                  <option>PNG</option><option>JPG</option><option>WEBP</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-ink h-12">
                  <input type="checkbox" className="w-5 h-5 rounded border-hair text-coral-500 focus-visible:ring-2 focus-visible:ring-coral-500" defaultChecked />
                  Keep original file after converting
                </label>
              </div>
            </div>
          </section>

          {/* CARDS & TOOL CARDS */}
          <section id="tool-cards">
            <h2 className="font-display font-800 text-2xl text-ink mb-1">4. Cards &amp; tool cards</h2>
            <p className="text-muted mb-6">A category colour strip on top identifies what kind of tool it is — not a uniform grey shadow on everything.</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <a href="#" className="group block rounded-xl2 border border-hair bg-surface overflow-hidden hover:shadow-lift transition-shadow">
                <div className="h-1.5 bg-teal-500"></div>
                <div className="p-5">
                  <div className="w-10 h-10 rounded-xl bg-tealx-100 text-tealx-600 grid place-items-center mb-3">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h4v4H4zM16 4h4v4h-4zM4 16h4v4H4z"/><path d="M12 4v4M9 12h6M16 12h4v4M12 16v4h4"/></svg>
                  </div>
                  <p className="font-display font-700 text-ink">QR Code Generator</p>
                  <p className="text-sm text-muted mt-1">URL, Wi-Fi, contact card, and more. Free, no login needed.</p>
                </div>
              </a>
              <a href="#" className="group block rounded-xl2 border border-hair bg-surface overflow-hidden hover:shadow-lift transition-shadow">
                <div className="h-1.5 bg-coral-500"></div>
                <div className="p-5">
                  <div className="w-10 h-10 rounded-xl bg-coralx-100 text-coralx-600 grid place-items-center mb-3">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/></svg>
                  </div>
                  <p className="font-display font-700 text-ink">URL Shortener</p>
                  <p className="text-sm text-muted mt-1">Paste a long link, get a short one. Track clicks if you want to.</p>
                </div>
              </a>
              <a href="#" className="group block rounded-xl2 border border-hair bg-surface overflow-hidden hover:shadow-lift transition-shadow">
                <div className="h-1.5 bg-purple-500"></div>
                <div className="p-5">
                  <div className="w-10 h-10 rounded-xl bg-purplex-100 text-purplex-600 grid place-items-center mb-3">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15l4-4 3 3 5-6 6 6"/></svg>
                  </div>
                  <p className="font-display font-700 text-ink">JPG → PNG</p>
                  <p className="text-sm text-muted mt-1">Convert images in your browser. Nothing uploaded until you say so.</p>
                </div>
              </a>
            </div>
          </section>

          {/* TABS, BADGES, TOOLTIPS */}
          <section id="tabs-badges">
            <h2 className="font-display font-800 text-2xl text-ink mb-1">5. Tabs, badges &amp; tooltips</h2>
            <div className="bg-surface border border-hair rounded-xl2 p-6 space-y-8">
              <div>
                <div role="tablist" aria-label="Result view" className="inline-flex bg-wash rounded-full p-1 gap-1">
                  <button role="tab" aria-selected="true" data-tab="tabPreview" className="tab-btn px-4 h-9 rounded-full text-sm font-semibold bg-surface shadow-soft text-ink">Preview</button>
                  <button role="tab" aria-selected="false" data-tab="tabDetails" className="tab-btn px-4 h-9 rounded-full text-sm font-semibold text-muted">Details</button>
                  <button role="tab" aria-selected="false" data-tab="tabHistory" className="tab-btn px-4 h-9 rounded-full text-sm font-semibold text-muted">History</button>
                </div>
                <div className="mt-4">
                  <div id="tabPreview" className="tab-panel active text-sm text-muted">Preview panel content sits here.</div>
                  <div id="tabDetails" className="tab-panel text-sm text-muted">Details panel content sits here.</div>
                  <div id="tabHistory" className="tab-panel text-sm text-muted">History panel content sits here.</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center px-2.5 h-6 rounded-full bg-tealx-100 text-tealx-600 text-xs font-semibold">Active</span>
                <span className="inline-flex items-center px-2.5 h-6 rounded-full bg-yellowx-100 text-yellowx-600 text-xs font-semibold">Pending</span>
                <span className="inline-flex items-center px-2.5 h-6 rounded-full bg-danger-100 text-danger-700 text-xs font-semibold">Expired</span>
                <span className="inline-flex items-center px-2.5 h-6 rounded-full bg-chip text-strong text-xs font-semibold">Free plan</span>
                <span className="inline-flex items-center px-2.5 h-6 rounded-full bg-purplex-100 text-purplex-600 text-xs font-semibold">Pro</span>
              </div>
              <div>
                <button className="relative group inline-flex items-center gap-1.5 text-sm text-strong border border-hair rounded-lg px-3 h-9" aria-describedby="ttip1">
                  Error correction
                  <svg className="w-4 h-4 text-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>
                </button>
                <span id="ttip1" role="tooltip" className="hidden group-hover:block group-focus:block absolute mt-1 bg-navy-900 text-white text-xs rounded-lg px-3 py-2 max-w-xs shadow-lift">Higher correction lets a scanner read your code even if part of it is damaged or covered by a logo.</span>
              </div>
            </div>
          </section>

          {/* MODALS & NOTIFICATIONS */}
          <section id="modals-alerts">
            <h2 className="font-display font-800 text-2xl text-ink mb-1">6. Modals, alerts &amp; notifications</h2>
            <div className="bg-surface border border-hair rounded-xl2 p-6 space-y-6">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-tealx-100 border border-teal-300">
                  <svg className="w-5 h-5 text-tealx-600 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>
                  <div><p className="text-sm font-semibold text-ink">Kaam ho gaya.</p><p className="text-sm text-strong">Your link is live and ready to share.</p></div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-xl bg-danger-50 border border-danger-200">
                  <svg className="w-5 h-5 text-danger-600 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
                  <div><p className="text-sm font-semibold text-ink">That slug is taken.</p><p className="text-sm text-strong">Try another — or leave it blank and we&apos;ll pick one.</p></div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-xl bg-yellowx-100 border border-yellow-300">
                  <svg className="w-5 h-5 text-yellowx-600 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l9 16H3l9-16z"/><path d="M12 10v3M12 16h.01"/></svg>
                  <div><p className="text-sm font-semibold text-ink">Almost at your free limit.</p><p className="text-sm text-strong">2 of 5 free conversions left today.</p></div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-xl bg-wash border border-hair">
                  <svg className="w-5 h-5 text-strong shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
                  <div><p className="text-sm font-semibold text-ink">You&apos;re offline.</p><p className="text-sm text-strong">We&apos;ll convert this as soon as you&apos;re back.</p></div>
                </div>
              </div>
              <div>
                <button id="openModalBtn" className="h-11 px-5 rounded-lg border border-ink text-ink text-sm font-semibold hover:bg-wash">Open example modal</button>
                <button id="fireToastBtn" className="h-11 px-5 rounded-lg border border-ink text-ink text-sm font-semibold hover:bg-wash ml-2">Fire a toast</button>
              </div>
            </div>
          </section>

          {/* UPLOAD & FILE COMPONENTS */}
          <section id="upload">
            <h2 className="font-display font-800 text-2xl text-ink mb-1">7. Upload &amp; file components</h2>
            <p className="text-muted mb-6">Try dragging a file over the box below, or click to add one — it&apos;s a UI demo, nothing actually uploads.</p>
            <div className="bg-surface border border-hair rounded-xl2 p-6 space-y-6">
              <div id="dropzone" className="dropzone border-2 border-dashed border-hair rounded-xl2 p-10 text-center transition-colors">
                <svg className="w-10 h-10 mx-auto text-faint mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 16V4M8 8l4-4 4 4"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/></svg>
                <p className="font-display font-700 text-ink">Drop images here</p>
                <p className="text-sm text-muted mt-1">or <label htmlFor="fileInput" className="text-coral-600 font-semibold underline cursor-pointer">browse your device</label></p>
                <input id="fileInput" type="file" multiple className="sr-only" />
              </div>
              <div id="fileList" className="space-y-2"></div>
              <template id="fileCardTemplate">
                <div className="flex items-center gap-3 p-3 rounded-xl border border-hair">
                  <div className="w-10 h-10 rounded-lg bg-wash grid place-items-center text-faint shrink-0">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15l4-4 3 3 5-6 6 6"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="file-name text-sm font-medium text-ink truncate">photo.jpg</p>
                    <p className="file-meta text-xs text-muted">2.4 MB</p>
                    <div className="h-1.5 bg-wash rounded-full mt-1.5 overflow-hidden"><div className="progress-bar h-full bg-coral-500 rounded-full" style={{ width: '0%' }}></div></div>
                  </div>
                  <button className="remove-file text-xs font-semibold text-strong hover:text-danger-600 shrink-0">Remove</button>
                </div>
              </template>
            </div>
          </section>

          {/* RESULT COMPONENTS */}
          <section id="results">
            <h2 className="font-display font-800 text-2xl text-ink mb-1">8. Result components</h2>
            <p className="text-muted mb-6">The same result-card shape carries three different products — only the content inside changes.</p>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="rounded-xl2 border border-teal-300 bg-tealx-100 p-5">
                <p className="text-xs font-semibold text-tealx-600 mb-2">Your short link</p>
                <div className="flex items-center gap-2 bg-surface rounded-lg border border-hair px-3 h-10 mb-3">
                  <p className="flex-1 text-sm font-semibold text-ink truncate">kaamsolv.com/x7Kp2</p>
                  <button className="copy-btn relative text-xs font-semibold text-coral-600 shrink-0" data-copy="kaamsolv.com/x7Kp2">
                    Copy
                    <span className="copy-flash absolute -top-7 right-0 bg-navy-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">Copied!</span>
                  </button>
                </div>
                <div className="flex gap-2 text-xs font-semibold">
                  <button className="flex-1 h-9 rounded-lg border border-hair bg-surface text-strong">Share</button>
                  <button className="flex-1 h-9 rounded-lg border border-hair bg-surface text-strong">QR code</button>
                  <button className="flex-1 h-9 rounded-lg border border-hair bg-surface text-strong">Analytics</button>
                </div>
              </div>

              <div className="rounded-xl2 border border-teal-300 bg-tealx-100 p-5">
                <p className="text-xs font-semibold text-tealx-600 mb-2">Your QR code</p>
                <div className="qr-paper w-full aspect-square rounded-lg border border-hair grid place-items-center mb-3">
                  <svg viewBox="0 0 100 100" className="w-24 h-24" fill="#0C2248"><rect x="4" y="4" width="24" height="24"/><rect x="36" y="4" width="8" height="8"/><rect x="52" y="4" width="8" height="8"/><rect x="72" y="4" width="24" height="24"/><rect x="4" y="72" width="24" height="24"/><rect x="36" y="20" width="8" height="24"/><rect x="52" y="36" width="24" height="8"/><rect x="72" y="52" width="8" height="8"/><rect x="52" y="60" width="16" height="16"/><rect x="72" y="72" width="24" height="24"/><rect x="36" y="52" width="8" height="8"/></svg>
                </div>
                <div className="flex gap-2 text-xs font-semibold">
                  <button className="flex-1 h-9 rounded-lg bg-coral-500 text-navy-900">Download PNG</button>
                  <button className="flex-1 h-9 rounded-lg border border-hair bg-surface text-strong">SVG</button>
                </div>
                <p className="text-xs text-faint mt-2">Preview stays on a light &quot;paper&quot; swatch in both themes — QR codes should look print-ready, not theme-matched.</p>
              </div>

              <div className="rounded-xl2 border border-teal-300 bg-tealx-100 p-5">
                <p className="text-xs font-semibold text-tealx-600 mb-2">Conversion complete</p>
                <div className="flex items-center gap-3 bg-surface rounded-lg border border-hair p-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-purplex-100 text-purplex-600 grid place-items-center shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                  </div>
                  <div className="flex-1"><p className="text-sm font-medium text-ink">photo.png</p><p className="text-xs text-muted">1.1 MB · was 2.4 MB</p></div>
                </div>
                <div className="flex gap-2 text-xs font-semibold">
                  <button className="flex-1 h-9 rounded-lg bg-coral-500 text-navy-900">Download</button>
                  <button className="flex-1 h-9 rounded-lg border border-hair bg-surface text-strong">Download all</button>
                </div>
              </div>
            </div>
          </section>

          {/* QR COMPONENTS — PROVISIONAL */}
          <section id="qr">
            <h2 className="font-display font-800 text-2xl text-ink mb-1">9. QR components</h2>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-yellowx-100 border border-yellow-300 mb-4">
              <svg className="w-5 h-5 text-yellowx-600 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l9 16H3l9-16z"/><path d="M12 10v3M12 16h.01"/></svg>
              <div>
                <p className="text-sm font-semibold text-ink">Provisional — not the final Phase 4 spec.</p>
                <p className="text-sm text-strong mt-0.5">These are reusable components for the design system, not a locked product decision. Supported QR types, dynamic-vs-static, logo handling, campaigns, tracking and account requirements will be defined properly in Phase 4.</p>
              </div>
            </div>
            <p className="text-muted mb-6">Pick a type. Only the fields that type needs appear — the pattern to keep, whatever the final type list turns out to be.</p>
            <div className="bg-surface border border-hair rounded-xl2 p-6">
              <p className="text-sm font-semibold text-ink mb-3">What do you want your QR to do?</p>
              <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="QR type">
                <button data-qr="url" className="qr-type-btn px-4 h-10 rounded-full border border-activebg bg-activebg text-activetext text-sm font-semibold">Website</button>
                <button data-qr="wifi" className="qr-type-btn px-4 h-10 rounded-full border border-hair text-sm font-semibold text-strong">Wi-Fi</button>
                <button data-qr="contact" className="qr-type-btn px-4 h-10 rounded-full border border-hair text-sm font-semibold text-strong">Contact</button>
                <button data-qr="whatsapp" className="qr-type-btn px-4 h-10 rounded-full border border-hair text-sm font-semibold text-strong">WhatsApp</button>
                <button data-qr="email" className="qr-type-btn px-4 h-10 rounded-full border border-hair text-sm font-semibold text-strong">Email</button>
              </div>

              <div id="qr-url" className="qr-field-group active">
                <label className="block text-sm font-semibold text-ink mb-1.5" htmlFor="qrUrl">Website address</label>
                <input id="qrUrl" type="url" placeholder="https://example.com" className="w-full h-12 px-4 rounded-lg border border-hair bg-fieldbg text-ink text-sm mb-4" />
              </div>
              <div id="qr-wifi" className="qr-field-group">
                <div className="grid sm:grid-cols-2 gap-4 mb-4">
                  <div><label className="block text-sm font-semibold text-ink mb-1.5">Network name</label><input type="text" className="w-full h-12 px-4 rounded-lg border border-hair bg-fieldbg text-ink text-sm" /></div>
                  <div><label className="block text-sm font-semibold text-ink mb-1.5">Password</label><input type="text" className="w-full h-12 px-4 rounded-lg border border-hair bg-fieldbg text-ink text-sm" /></div>
                </div>
              </div>
              <div id="qr-contact" className="qr-field-group">
                <div className="grid sm:grid-cols-2 gap-4 mb-4">
                  <div><label className="block text-sm font-semibold text-ink mb-1.5">Full name</label><input type="text" className="w-full h-12 px-4 rounded-lg border border-hair bg-fieldbg text-ink text-sm" /></div>
                  <div><label className="block text-sm font-semibold text-ink mb-1.5">Phone</label><input type="tel" className="w-full h-12 px-4 rounded-lg border border-hair bg-fieldbg text-ink text-sm" /></div>
                </div>
              </div>
              <div id="qr-whatsapp" className="qr-field-group">
                <label className="block text-sm font-semibold text-ink mb-1.5">WhatsApp number</label>
                <input type="tel" placeholder="+91" className="w-full h-12 px-4 rounded-lg border border-hair bg-fieldbg text-ink text-sm mb-4" />
              </div>
              <div id="qr-email" className="qr-field-group">
                <div className="grid sm:grid-cols-2 gap-4 mb-4">
                  <div><label className="block text-sm font-semibold text-ink mb-1.5">Email address</label><input type="email" className="w-full h-12 px-4 rounded-lg border border-hair bg-fieldbg text-ink text-sm" /></div>
                  <div><label className="block text-sm font-semibold text-ink mb-1.5">Subject</label><input type="text" className="w-full h-12 px-4 rounded-lg border border-hair bg-fieldbg text-ink text-sm" /></div>
                </div>
              </div>

              <details className="group border-t border-hair pt-4">
                <summary className="accordion-trigger flex items-center justify-between cursor-pointer text-sm font-semibold text-ink list-none">
                  Customise appearance (optional)
                  <svg className="chev w-4 h-4 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                </summary>
                <div className="pt-4 grid sm:grid-cols-3 gap-4">
                  <div><label className="block text-xs font-semibold text-ink mb-1.5">Foreground</label><div className="flex gap-1.5"><button className="w-8 h-8 rounded-full bg-navy-900 ring-2 ring-offset-2 ring-navy-900"></button><button className="w-8 h-8 rounded-full bg-coral-500"></button><button className="w-8 h-8 rounded-full bg-purple-500"></button></div></div>
                  <div><label className="block text-xs font-semibold text-ink mb-1.5">Error correction</label><select className="w-full h-10 px-3 rounded-lg border border-hair bg-fieldbg text-ink text-sm"><option>Medium (default)</option><option>High — logo-safe</option></select></div>
                  <div><label className="block text-xs font-semibold text-ink mb-1.5">Add logo</label><button className="w-full h-10 rounded-lg border border-dashed border-hair text-xs text-muted">Upload image</button></div>
                </div>
              </details>
            </div>
          </section>

          {/* ANALYTICS, CHARTS, TABLES, FILTERS */}
          <section id="analytics">
            <h2 className="font-display font-800 text-2xl text-ink mb-1">10. Analytics, charts &amp; tables</h2>
            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              <div className="rounded-xl2 border border-hair bg-surface p-5"><p className="text-xs text-muted mb-1">Total scans</p><p className="font-display font-800 text-3xl text-ink">1,284</p><p className="text-xs text-tealx-600 font-semibold mt-1">↑ 12% this week</p></div>
              <div className="rounded-xl2 border border-hair bg-surface p-5"><p className="text-xs text-muted mb-1">Unique visitors</p><p className="font-display font-800 text-3xl text-ink">903</p><p className="text-xs text-tealx-600 font-semibold mt-1">↑ 4% this week</p></div>
              <div className="rounded-xl2 border border-hair bg-surface p-5"><p className="text-xs text-muted mb-1">Top source</p><p className="font-display font-800 text-3xl text-ink">WhatsApp</p><p className="text-xs text-muted mt-1">41% of scans</p></div>
            </div>

            <div className="bg-surface border border-hair rounded-xl2 p-5 mb-6">
              <p className="text-sm font-semibold text-ink mb-4">Scans, last 7 days</p>
              <svg viewBox="0 0 280 90" className="w-full h-24" preserveAspectRatio="none">
                <polyline points="0,70 40,55 80,58 120,30 160,40 200,15 240,25 280,10" fill="none" stroke="#38BBAC" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div className="flex justify-between text-xs text-muted mt-1"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
            </div>

            <div className="bg-surface border border-hair rounded-xl2 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex gap-2" role="group" aria-label="Filter by status">
                  <button aria-pressed="true" className="filter-chip px-3 h-8 rounded-full border border-hair text-xs font-semibold text-strong" data-status="all">All</button>
                  <button aria-pressed="false" className="filter-chip px-3 h-8 rounded-full border border-hair text-xs font-semibold text-strong" data-status="active">Active</button>
                  <button aria-pressed="false" className="filter-chip px-3 h-8 rounded-full border border-hair text-xs font-semibold text-strong" data-status="expired">Expired</button>
                </div>
                <input id="tableSearch" type="search" placeholder="Search links…" className="h-9 px-3 rounded-lg border border-hair bg-fieldbg text-ink text-sm w-full sm:w-56" />
              </div>
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm min-w-[480px]">
                  <thead><tr className="text-left text-xs text-muted border-b border-hair">
                    <th className="py-2 px-2">Short link</th><th className="py-2 px-2">Destination</th><th className="py-2 px-2">Clicks</th><th className="py-2 px-2">Status</th>
                  </tr></thead>
                  <tbody id="demoTableBody">
                    <tr className="table-row border-b border-hair" data-status="active"><td className="py-2 px-2 font-medium text-ink">/x7Kp2</td><td className="py-2 px-2 text-muted truncate max-w-[160px]">weekend-menu-2025.com</td><td className="py-2 px-2 text-ink">312</td><td className="py-2 px-2"><span className="px-2 h-5 inline-flex items-center rounded-full bg-tealx-100 text-tealx-600 text-xs font-semibold">Active</span></td></tr>
                    <tr className="table-row border-b border-hair" data-status="active"><td className="py-2 px-2 font-medium text-ink">/menu99</td><td className="py-2 px-2 text-muted truncate max-w-[160px]">restaurant.example/specials</td><td className="py-2 px-2 text-ink">88</td><td className="py-2 px-2"><span className="px-2 h-5 inline-flex items-center rounded-full bg-tealx-100 text-tealx-600 text-xs font-semibold">Active</span></td></tr>
                    <tr className="table-row border-b border-hair" data-status="expired"><td className="py-2 px-2 font-medium text-ink">/diwali22</td><td className="py-2 px-2 text-muted truncate max-w-[160px]">shop.example/diwali-sale</td><td className="py-2 px-2 text-ink">1,204</td><td className="py-2 px-2"><span className="px-2 h-5 inline-flex items-center rounded-full bg-danger-100 text-danger-700 text-xs font-semibold">Expired</span></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* STATES */}
          <section id="states">
            <h2 className="font-display font-800 text-2xl text-ink mb-1">11. States</h2>
            <p className="text-muted mb-6">Every tool needs all seven. None of them should feel like a dead end.</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="rounded-xl2 border border-hair bg-surface p-6 text-center">
                <svg className="w-8 h-8 mx-auto text-faint mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3v18M3 12h18"/></svg>
                <p className="text-sm font-semibold text-ink">Empty</p><p className="text-xs text-muted mt-1">No links yet. Shorten your first one above.</p>
              </div>
              <div className="rounded-xl2 border border-hair bg-surface p-6 text-center">
                <svg className="w-8 h-8 mx-auto text-faint mb-2 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity=".3"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2"/></svg>
                <p className="text-sm font-semibold text-ink">Loading</p><p className="text-xs text-muted mt-1">Fetching your links…</p>
              </div>
              <div className="rounded-xl2 border border-hair bg-surface p-6 text-center">
                <div className="w-8 h-8 mx-auto mb-2 rounded-full border-2 border-coral-500 border-t-transparent animate-spin"></div>
                <p className="text-sm font-semibold text-ink">Processing</p><p className="text-xs text-muted mt-1">Converting photo.jpg…</p>
              </div>
              <div className="rounded-xl2 border border-teal-300 bg-tealx-100 p-6 text-center">
                <svg className="w-8 h-8 mx-auto text-tealx-600 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>
                <p className="text-sm font-semibold text-ink">Success</p><p className="text-xs text-strong mt-1">Bas. You&apos;re done.</p>
              </div>
              <div className="rounded-xl2 border border-danger-200 bg-danger-50 p-6 text-center">
                <svg className="w-8 h-8 mx-auto text-danger-600 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
                <p className="text-sm font-semibold text-ink">Error</p><p className="text-xs text-strong mt-1">That file is too large. Max 10 MB.</p>
              </div>
              <div className="rounded-xl2 border border-hair bg-wash p-6 text-center opacity-80">
                <svg className="w-8 h-8 mx-auto text-faint mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3l18 18M12 3a9 9 0 0 1 8.5 12"/></svg>
                <p className="text-sm font-semibold text-ink">Offline</p><p className="text-xs text-muted mt-1">We&apos;ll process this once you&apos;re back online.</p>
              </div>
            </div>
          </section>

          {/* APP DASHBOARD SHELL */}
          <section id="app-shell">
            <h2 className="font-display font-800 text-2xl text-ink mb-1">12. App dashboard shell</h2>
            <p className="text-muted mb-6">Same brand, same components — the app just wraps them in a sidebar instead of a marketing header. The sidebar itself stays literal dark navy in both themes, like the top status bar.</p>
            <div className="rounded-xl2 border border-hair bg-surface overflow-hidden">
              <div className="flex h-[420px] relative">
                <aside id="appSidebar" className="sidebar-app w-64 bg-navy-900 text-white p-4 flex flex-col gap-1 shrink-0">
                  <p className="font-display font-800 text-lg px-2 mb-4">Kaam<span className="text-coral-500">Solv</span></p>
                  <a href="#" className="flex items-center gap-3 px-3 h-10 rounded-lg bg-white/10 text-sm font-medium">Dashboard</a>
                  <a href="#" className="flex items-center gap-3 px-3 h-10 rounded-lg hover:bg-white/5 text-sm text-navy-300">Links</a>
                  <a href="#" className="flex items-center gap-3 px-3 h-10 rounded-lg hover:bg-white/5 text-sm text-navy-300">QR Codes</a>
                  <a href="#" className="flex items-center gap-3 px-3 h-10 rounded-lg hover:bg-white/5 text-sm text-navy-300">Campaigns</a>
                  <a href="#" className="flex items-center gap-3 px-3 h-10 rounded-lg hover:bg-white/5 text-sm text-navy-300">Files</a>
                  <a href="#" className="flex items-center gap-3 px-3 h-10 rounded-lg hover:bg-white/5 text-sm text-navy-300">Analytics</a>
                  <div className="mt-auto space-y-1">
                    <a href="#" className="flex items-center gap-3 px-3 h-10 rounded-lg hover:bg-white/5 text-sm text-navy-300">Billing</a>
                    <a href="#" className="flex items-center gap-3 px-3 h-10 rounded-lg hover:bg-white/5 text-sm text-navy-300">Settings</a>
                  </div>
                </aside>
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="h-14 border-b border-hair flex items-center justify-between px-4 shrink-0">
                    <button id="appSidebarToggle" className="lg:hidden w-9 h-9 grid place-items-center rounded-lg hover:bg-wash" aria-label="Open navigation" aria-expanded="false" aria-controls="appSidebar">
                      <svg className="w-5 h-5 text-ink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
                    </button>
                    <p className="text-sm text-muted">Dashboard <span className="text-faint">/</span> Links</p>
                    <div className="w-8 h-8 rounded-full bg-coral-500 text-navy-900 text-xs font-bold grid place-items-center">RK</div>
                  </div>
                  <div className="p-5 overflow-y-auto">
                    <p className="font-display font-700 text-ink mb-1">What do you want to get done?</p>
                    <input type="search" placeholder="Search KaamSolv…" className="w-full h-11 px-4 rounded-lg border border-hair bg-fieldbg text-ink text-sm mb-5" />
                    <div className="grid grid-cols-3 gap-3 mb-5">
                      <div className="rounded-xl border border-hair p-4"><p className="text-xs text-muted">Links</p><p className="font-display font-800 text-2xl text-ink">24</p></div>
                      <div className="rounded-xl border border-hair p-4"><p className="text-xs text-muted">QR codes</p><p className="font-display font-800 text-2xl text-ink">12</p></div>
                      <div className="rounded-xl border border-hair p-4"><p className="text-xs text-muted">Files</p><p className="font-display font-800 text-2xl text-ink">38</p></div>
                    </div>
                    <p className="text-xs font-semibold text-ink mb-2">Quick tools</p>
                    <div className="flex gap-2 flex-wrap">
                      <button className="h-9 px-4 rounded-full border border-hair text-xs font-semibold text-strong">Shorten URL</button>
                      <button className="h-9 px-4 rounded-full border border-hair text-xs font-semibold text-strong">Create QR</button>
                      <button className="h-9 px-4 rounded-full border border-hair text-xs font-semibold text-strong">Convert image</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted mt-2">Resize this preview or view on mobile — the sidebar collapses behind the hamburger button below 1024px.</p>
          </section>

          {/* PRICING */}
          <section id="pricing">
            <h2 className="font-display font-800 text-2xl text-ink mb-1">13. Pricing components</h2>
            <div className="flex items-center gap-3 mb-5">
              <span className="text-sm font-medium text-ink">Monthly</span>
              <button id="billingToggle" role="switch" aria-checked="false" className="w-12 h-7 rounded-full bg-chip relative transition-colors">
                <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform"></span>
              </button>
              <span className="text-sm font-medium text-muted">Yearly <span className="text-tealx-600 font-semibold">save 20%</span></span>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
              <div className="rounded-xl2 border border-hair bg-surface p-6">
                <p className="font-display font-700 text-ink mb-1">Free</p>
                <p className="font-display font-800 text-3xl text-ink mb-3">₹0</p>
                <ul className="text-sm text-muted space-y-1.5 mb-5">
                  <li>Unlimited basic shortening &amp; QR</li>
                  <li>5 image conversions / day</li>
                  <li>7-day link analytics</li>
                </ul>
                <button className="w-full h-11 rounded-lg border border-ink text-ink text-sm font-semibold">Current plan</button>
              </div>
              <div className="rounded-xl2 border-2 border-coral-500 bg-surface p-6 relative">
                <span className="absolute -top-3 left-6 bg-coral-500 text-navy-900 text-xs font-semibold px-2 py-0.5 rounded-full">Most useful</span>
                <p className="font-display font-700 text-ink mb-1">Pro</p>
                <p id="priceDisplay" className="font-display font-800 text-3xl text-ink mb-3">₹299<span className="text-sm font-normal text-muted">/mo</span></p>
                <ul className="text-sm text-strong space-y-1.5 mb-5">
                  <li>Full analytics history</li>
                  <li>Campaigns &amp; branded links</li>
                  <li>Batch image processing</li>
                </ul>
                <button className="w-full h-11 rounded-full bg-coral-500 text-navy-900 text-sm font-semibold">Upgrade</button>
              </div>
            </div>
          </section>

          {/* FLUID TOOL UX DEMOS */}
          <section id="fluid-demos">
            <h2 className="font-display font-800 text-2xl text-ink mb-1">14. Fluid tool UX — progressive disclosure end-to-end</h2>
            <p className="text-muted mb-6">Three working mini-demos of the actual flow each product will use. Try them.</p>
            <div className="grid lg:grid-cols-3 gap-4">
              <div className="rounded-xl2 border border-hair bg-surface p-5">
                <p className="text-xs font-semibold text-coral-600 mb-3">URL Shortener flow</p>
                <div id="urlStep1">
                  <input id="urlDemoInput" type="url" placeholder="Paste your URL" className="w-full h-11 px-3 rounded-lg border border-hair bg-fieldbg text-ink text-sm mb-3" />
                  <button id="urlDemoBtn" className="w-full h-11 rounded-full bg-coral-500 text-navy-900 text-sm font-semibold">Shorten it</button>
                </div>
                <div id="urlStep2" className="hidden">
                  <div className="flex items-center gap-2 bg-wash rounded-lg px-3 h-11 mb-3">
                    <p className="flex-1 text-sm font-semibold text-ink">kaamsolv.com/x7Kp2</p>
                    <button className="text-xs font-semibold text-coral-600">Copy</button>
                  </div>
                  <button id="urlDemoReset" className="text-xs text-muted underline">Try another</button>
                </div>
              </div>

              <div className="rounded-xl2 border border-hair bg-surface p-5">
                <p className="text-xs font-semibold text-teal-600 mb-3">QR Generator flow</p>
                <div id="qrStep1">
                  <p className="text-sm font-medium text-ink mb-2">Choose a type</p>
                  <div className="flex gap-2 flex-wrap">
                    <button data-qrmini="true" className="qrmini-btn px-3 h-9 rounded-full border border-hair text-xs font-semibold text-strong">Website</button>
                    <button data-qrmini="true" className="qrmini-btn px-3 h-9 rounded-full border border-hair text-xs font-semibold text-strong">Wi-Fi</button>
                  </div>
                </div>
                <div id="qrStep2" className="hidden">
                  <input type="text" placeholder="https://example.com" className="w-full h-11 px-3 rounded-lg border border-hair bg-fieldbg text-ink text-sm mb-3" />
                  <button id="qrDemoBtn" className="w-full h-11 rounded-full bg-coral-500 text-navy-900 text-sm font-semibold">Generate QR</button>
                </div>
                <div id="qrStep3" className="hidden text-center">
                  <div className="qr-paper inline-block rounded-lg p-2 mb-3"><svg viewBox="0 0 100 100" className="w-20 h-20" fill="#0C2248"><rect x="10" y="10" width="20" height="20"/><rect x="70" y="10" width="20" height="20"/><rect x="10" y="70" width="20" height="20"/><rect x="40" y="40" width="20" height="20"/></svg></div>
                  <br/>
                  <button id="qrDemoReset" className="text-xs text-muted underline">Start over</button>
                </div>
              </div>

              <div className="rounded-xl2 border border-hair bg-surface p-5">
                <p className="text-xs font-semibold text-purple-600 mb-3">Image Tool flow</p>
                <div id="imgStep1" className="dropzone border-2 border-dashed border-hair rounded-xl p-6 text-center cursor-pointer">
                  <p className="text-sm text-ink font-medium">Drop an image</p>
                  <p className="text-xs text-muted">or click to simulate</p>
                </div>
                <div id="imgStep2" className="hidden">
                  <div className="flex items-center gap-2 mb-3"><span className="text-xs text-muted">Convert to</span>
                    <select className="h-8 px-2 rounded-lg border border-hair bg-fieldbg text-ink text-xs"><option>PNG</option><option>WEBP</option></select>
                  </div>
                  <button id="imgDemoBtn" className="w-full h-11 rounded-full bg-coral-500 text-navy-900 text-sm font-semibold">Convert</button>
                </div>
                <div id="imgStep3" className="hidden text-center">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-full border-2 border-coral-500 border-t-transparent animate-spin"></div>
                  <p className="text-xs text-muted">Converting…</p>
                </div>
                <div id="imgStep4" className="hidden">
                  <p className="text-sm font-semibold text-tealx-600 mb-2">✓ Done — photo.png ready</p>
                  <button id="imgDemoReset" className="text-xs text-muted underline">Convert another</button>
                </div>
              </div>
            </div>
          </section>

          {/* CATEGORIES & INCREMENTAL CATALOGUE PATTERN */}
          <section id="categories">
            <h2 className="font-display font-800 text-2xl text-ink mb-1">15. Categories &amp; incremental catalogue</h2>
            <p className="text-muted mb-6">The ten category names are locked. What&apos;s <em>inside</em> each one grows over time — the layout has to look intentional at every size, from one tool to fifty.</p>

            <h3 className="font-display font-700 text-ink mb-3">The ten categories, today</h3>
            <div className="flex flex-wrap gap-2 mb-8">
              <span className="px-3 h-9 inline-flex items-center gap-2 rounded-full border border-hair text-sm font-medium text-ink">Money <span className="text-xs text-faint">— 0 live</span></span>
              <span className="px-3 h-9 inline-flex items-center gap-2 rounded-full border-2 border-coral-500 text-sm font-medium text-ink">Work <span className="text-xs font-semibold text-coral-600">— 1 live</span></span>
              <span className="px-3 h-9 inline-flex items-center gap-2 rounded-full border border-hair text-sm font-medium text-ink">Business <span className="text-xs text-faint">— 0 live</span></span>
              <span className="px-3 h-9 inline-flex items-center gap-2 rounded-full border border-hair text-sm font-medium text-ink">Documents <span className="text-xs text-faint">— 0 live</span></span>
              <span className="px-3 h-9 inline-flex items-center gap-2 rounded-full border border-hair text-sm font-medium text-ink">Images &amp; Files <span className="text-xs text-faint">— 0 live</span></span>
              <span className="px-3 h-9 inline-flex items-center gap-2 rounded-full border border-hair text-sm font-medium text-ink">Writing <span className="text-xs text-faint">— 0 live</span></span>
              <span className="px-3 h-9 inline-flex items-center gap-2 rounded-full border border-hair text-sm font-medium text-ink">Career <span className="text-xs text-faint">— 0 live</span></span>
              <span className="px-3 h-9 inline-flex items-center gap-2 rounded-full border border-hair text-sm font-medium text-ink">Everyday <span className="text-xs text-faint">— 0 live</span></span>
              <span className="px-3 h-9 inline-flex items-center gap-2 rounded-full border border-hair text-sm font-medium text-ink">India <span className="text-xs text-faint">— 0 live</span></span>
              <span className="px-3 h-9 inline-flex items-center gap-2 rounded-full border border-hair text-sm font-medium text-ink">Creators <span className="text-xs text-faint">— 0 live</span></span>
            </div>
            <p className="text-xs text-faint mb-8">A plain count, not a wall of &quot;coming soon&quot; cards — categories with zero live tools simply don&apos;t list any yet.</p>

            <h3 className="font-display font-700 text-ink mb-3">Adaptive density pattern <span className="text-sm font-normal text-faint">— reference only, not live data</span></h3>
            <div className="grid lg:grid-cols-3 gap-4">
              <div className="rounded-xl2 border-2 border-coral-500 bg-surface p-5">
                <p className="text-xs font-semibold text-coral-600 mb-1">1 tool → single strong experience</p>
                <p className="text-xs text-faint mb-3">e.g. Work, today</p>
                <div className="rounded-xl border border-hair p-4">
                  <div className="w-9 h-9 rounded-lg bg-coralx-100 text-coralx-600 grid place-items-center mb-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/></svg>
                  </div>
                  <p className="font-display font-700 text-ink text-sm">URL Shortener</p>
                  <p className="text-xs text-muted mt-1">Paste a long link, get a short one.</p>
                </div>
              </div>
              <div className="rounded-xl2 border border-hair bg-surface p-5">
                <p className="text-xs font-semibold text-strong mb-1">2–4 tools → simple grid</p>
                <p className="text-xs text-faint mb-3">pattern example</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-hair p-3"><p className="text-xs font-semibold text-ink">Tool A</p></div>
                  <div className="rounded-lg border border-hair p-3"><p className="text-xs font-semibold text-ink">Tool B</p></div>
                  <div className="rounded-lg border border-hair p-3"><p className="text-xs font-semibold text-ink">Tool C</p></div>
                </div>
              </div>
              <div className="rounded-xl2 border border-hair bg-surface p-5">
                <p className="text-xs font-semibold text-strong mb-1">5+ tools → featured + all</p>
                <p className="text-xs text-faint mb-3">pattern example</p>
                <p className="text-xs font-semibold text-ink mb-1">Featured</p>
                <div className="rounded-lg border border-hair p-2 mb-2"><p className="text-xs text-ink">Tool A · Tool B</p></div>
                <p className="text-xs font-semibold text-ink mb-1">All tools</p>
                <div className="rounded-lg border border-hair p-2"><p className="text-xs text-muted">Tool C, D, E, F…</p></div>
              </div>
            </div>
          </section>

          <footer className="border-t border-hair pt-8 text-sm text-muted">
            <p className="font-display font-700 text-ink mb-1">Kaam<span className="text-coral-500">Solv</span></p>
            <p className="italic text-faint mb-4">work smart.</p>
            <p>Phase 1 design system reference — components only, not wired to live data or a backend.</p>
          </footer>
        </main>
      </div>

      <div id="toast-region" role="status" aria-live="polite"></div>

      <div id="exampleModal" className="hidden fixed inset-0 z-[70] bg-navy-900/50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div className="bg-raised rounded-xl2 max-w-sm w-full p-6 shadow-lift">
          <h3 id="modalTitle" className="font-display font-700 text-ink mb-2">Delete this link?</h3>
          <p className="text-sm text-muted mb-5">Anyone who has kaamsolv.com/x7Kp2 will get a &quot;link not found&quot; page. This can&apos;t be undone.</p>
          <div className="flex gap-2">
            <button id="closeModalBtn" className="flex-1 h-11 rounded-lg border border-hair text-sm font-semibold text-ink">Cancel</button>
            <button className="flex-1 h-11 rounded-lg bg-red-600 text-white text-sm font-semibold">Delete</button>
          </div>
        </div>
      </div>
    </>
  );
}
