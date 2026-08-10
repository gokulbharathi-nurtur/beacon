'use client';

import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Icon visibility is pure CSS (dark: variant on the .dark class already set by the
// blocking init script in layout.tsx) — no React state needed, just flip the class.
export function ThemeToggle() {
  function toggle() {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme" className="size-8">
      <Sun className="size-4 scale-100 dark:scale-0" />
      <Moon className="absolute size-4 scale-0 dark:scale-100" />
    </Button>
  );
}
