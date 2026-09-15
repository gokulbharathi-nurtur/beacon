'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/** The per-project tab strip: Dashboard / Templates / Content check. Rendered by the
 * project layout, so it shows on every `/projects/[id]/...` page. */
export function ProjectSubNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  const tabs = [
    { href: base, label: 'Dashboard', exact: true },
    { href: `${base}/templates`, label: 'Templates', exact: false },
    { href: `${base}/content-check`, label: 'Content check', exact: false },
  ];

  return (
    <nav className="-mb-px flex gap-1 border-b border-border">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'border-b-2 px-3 py-2 text-sm transition-colors',
              active
                ? 'border-foreground font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
