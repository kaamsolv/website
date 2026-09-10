import { Icon } from './icons';

export type Crumb = { label: string; href?: string };

/**
 * Shared breadcrumb for tool and category pages. Server component. The last
 * item is the current page (`aria-current="page"`, not a link).
 */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-muted">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-x-1.5">
              {i > 0 && <Icon name="chevron-right" className="h-3.5 w-3.5 text-faint" />}
              {item.href && !isLast ? (
                <a
                  href={item.href}
                  className="rounded hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
                >
                  {item.label}
                </a>
              ) : (
                <span
                  className={isLast ? 'font-medium text-ink' : undefined}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
