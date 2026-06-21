import { MessageSquare, Code2, AtSign, Landmark, type LucideIcon } from 'lucide-react';
import type { AdvocateSegment, Platform } from '@prisma/client';

// --- Platforms --------------------------------------------------------------
export const PLATFORM_META: Record<Platform, { label: string; icon: LucideIcon; tint: string }> = {
  DISCORD: { label: 'Discord', icon: MessageSquare, tint: 'text-indigo-300' },
  GITHUB: { label: 'GitHub', icon: Code2, tint: 'text-zinc-300' },
  TWITTER: { label: 'Twitter', icon: AtSign, tint: 'text-sky-300' },
  DISCOURSE: { label: 'Discourse', icon: Landmark, tint: 'text-amber-300' },
};

export const ALL_PLATFORMS: Platform[] = ['DISCORD', 'GITHUB', 'TWITTER', 'DISCOURSE'];

/**
 * Consistent per-platform chart colour (HSL). Used by every chart and bar so a
 * platform reads as the same colour across the whole dashboard. Mirrors the
 * Tailwind text tints above.
 */
export const PLATFORM_CHART_COLOR: Record<Platform, string> = {
  DISCORD: 'hsl(234 89% 74%)', // indigo
  GITHUB: 'hsl(240 5% 65%)', // zinc
  TWITTER: 'hsl(199 89% 64%)', // sky
  DISCOURSE: 'hsl(38 92% 60%)', // amber
};

// --- Segments ---------------------------------------------------------------
// Ordered most → least engaged.
export const SEGMENT_ORDER: AdvocateSegment[] = ['CHAMPION', 'ADVOCATE', 'ACTIVE', 'CASUAL', 'LURKER'];

export const SEGMENT_META: Record<
  AdvocateSegment,
  { label: string; badge: string; bar: string; dot: string }
> = {
  CHAMPION: {
    label: 'Champion',
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
    bar: 'fill-violet-400',
    dot: 'bg-violet-400',
  },
  ADVOCATE: {
    label: 'Advocate',
    badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
    bar: 'fill-indigo-400',
    dot: 'bg-indigo-400',
  },
  ACTIVE: {
    label: 'Active',
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
    bar: 'fill-sky-400',
    dot: 'bg-sky-400',
  },
  CASUAL: {
    label: 'Casual',
    badge: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/25',
    bar: 'fill-zinc-400',
    dot: 'bg-zinc-400',
  },
  LURKER: {
    label: 'Lurker',
    badge: 'bg-zinc-700/30 text-zinc-400 border-zinc-700/40',
    bar: 'fill-zinc-600',
    dot: 'bg-zinc-600',
  },
};

// --- Numbers & dates --------------------------------------------------------
// British English throughout: en-GB locale for both numbers (thousands
// separators) and dates (e.g. "21 Jun 2026").
const LOCALE = 'en-GB';

export function compactNumber(n: number): string {
  return new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function fullNumber(n: number): string {
  return new Intl.NumberFormat(LOCALE).format(n);
}

/** A signed percentage with thousands separators, e.g. "+12%" or "-3%". */
export function signedPct(n: number, fractionDigits = 0): string {
  const formatted = new Intl.NumberFormat(LOCALE, {
    signDisplay: 'exceptZero',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n);
  return `${formatted}%`;
}

export function relativeTime(date: Date | string | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const day = 86400000;
  if (diff < day) return 'today';
  const days = Math.floor(diff / day);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function shortDate(date: Date | string | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  // en-GB: day-month-year, e.g. "21 Jun 2026".
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Percentage change of current vs prior; null when prior is 0. */
export function deltaPct(current: number, prior: number): number | null {
  if (prior === 0) return current === 0 ? 0 : null;
  return ((current - prior) / prior) * 100;
}
