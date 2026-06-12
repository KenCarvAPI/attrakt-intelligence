'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function NavTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/${slug}`;
  const tabs = [
    { href: base, label: 'Overview' },
    { href: `${base}/members`, label: 'Members' },
    { href: `${base}/context`, label: 'Context' },
  ];

  return (
    <nav className="flex items-center gap-1">
      {tabs.map((t) => {
        const active = t.href === base ? pathname === base : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
