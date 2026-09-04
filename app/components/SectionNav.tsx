'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { EVENT_CATEGORIES } from '@/lib/eventCategories';
import { cn } from '@/lib/utils';

export function SectionNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 text-sm text-muted-foreground">
      {EVENT_CATEGORIES.map((category) => {
        const active = pathname === `/${category.slug}` || pathname.startsWith(`/${category.slug}/`);
        return (
          <Link
            key={category.slug}
            href={`/${category.slug}`}
            className={cn('transition-colors hover:text-foreground', active && 'font-medium text-foreground')}
          >
            {category.label}
          </Link>
        );
      })}

      {/* Separates the template-based categories above (record once, diff-check later) from
          the catalog-driven tools below (no template — judged against the live package spec). */}
      <span aria-hidden className="h-4 w-px self-center bg-border" />

      {/* Not a category: an audit is judged against the canonical catalog rather than a
          saved template, so it applies to every kind of event at once. */}
      <Link
        href="/audit"
        className={cn(
          'transition-colors hover:text-foreground',
          pathname.startsWith('/audit') && 'font-medium text-foreground'
        )}
      >
        Audit
      </Link>

      {/* Also not a category: a sweep drives every element across a whole site rather than
          checking one already-captured page. */}
      <Link
        href="/coverage"
        className={cn(
          'transition-colors hover:text-foreground',
          pathname.startsWith('/coverage') && 'font-medium text-foreground'
        )}
      >
        Coverage
      </Link>

      {/* Also not a category: a plain crawl-and-list utility with no capture or comparison
          step at all. */}
      <Link
        href="/extract-urls"
        className={cn(
          'transition-colors hover:text-foreground',
          pathname.startsWith('/extract-urls') && 'font-medium text-foreground'
        )}
      >
        Extract URLs
      </Link>
    </nav>
  );
}
