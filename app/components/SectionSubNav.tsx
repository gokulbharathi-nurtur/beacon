'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function SectionSubNav({ categorySlug }: { categorySlug: string }) {
  const pathname = usePathname();
  const base = `/${categorySlug}`;
  const dashboardActive = pathname === base;
  const templatesActive = pathname.startsWith(`${base}/templates`);
  const contentCheckActive = pathname.startsWith(`${base}/content-check`);

  return (
    <div className="mb-8 flex gap-1 border-b border-border text-sm">
      <Link
        href={base}
        className={cn(
          'border-b-2 px-3 py-2 transition-colors',
          dashboardActive
            ? 'border-foreground font-medium text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        )}
      >
        Dashboard
      </Link>
      <Link
        href={`${base}/templates`}
        className={cn(
          'border-b-2 px-3 py-2 transition-colors',
          templatesActive
            ? 'border-foreground font-medium text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        )}
      >
        Templates
      </Link>

      {/* Content check is judged against the page_loaded event specifically, so it only
          applies under Load Events — Click/Form Events don't get this tab. */}
      {categorySlug === 'load-events' && (
        <Link
          href={`${base}/content-check`}
          className={cn(
            'border-b-2 px-3 py-2 transition-colors',
            contentCheckActive
              ? 'border-foreground font-medium text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          Content check
        </Link>
      )}
    </div>
  );
}
