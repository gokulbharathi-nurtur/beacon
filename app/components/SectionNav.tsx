'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/load-events', label: 'Dashboard', exact: true },
  { href: '/load-events/templates', label: 'Templates', exact: false },
  { href: '/load-events/content-check', label: 'Content check', exact: false },
] as const;

export function SectionNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 text-sm text-muted-foreground">
      {LINKS.map((link) => {
        const active = link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn('transition-colors hover:text-foreground', active && 'font-medium text-foreground')}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
