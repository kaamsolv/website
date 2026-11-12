import { SiteFooter } from '../site-footer';
import { SiteHeader } from '../site-header';

/**
 * The public frame: skip link, header, the page, footer. The one place that says what "a public page"
 * is; pages that want the plain frame use it instead of repeating the four lines. (Tool pages use
 * `ToolPageShell`, which sits on the same header and footer.)
 */
export function MarketingShell({ children, main = true }: { children: React.ReactNode; main?: boolean }) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      {main ? <main id="main">{children}</main> : children}
      <SiteFooter />
    </>
  );
}
