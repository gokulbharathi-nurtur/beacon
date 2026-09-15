'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function SectionNav() {
  const pathname = usePathname();
  const inProjects = pathname === '/projects' || pathname.startsWith('/projects/');
  const inTemplates = pathname === '/templates' || pathname.startsWith('/templates/');

  return (
    <nav className="flex gap-4 text-sm text-muted-foreground">
      <Link
        href="/projects"
        className={cn('transition-colors hover:text-foreground', inProjects && 'font-medium text-foreground')}
      >
        Projects
      </Link>
      <Link
        href="/templates"
        className={cn('transition-colors hover:text-foreground', inTemplates && 'font-medium text-foreground')}
      >
        Templates
      </Link>
    </nav>
  );
}
