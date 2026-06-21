'use client';

import { useMemo, useState } from 'react';
import { ArrowUpDown, Search } from 'lucide-react';
import type { AdvocateSegment, Platform } from '@prisma/client';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Sheet } from '@/components/ui/sheet';
import { MemberPanel } from '@/components/member-panel';
import {
  ALL_PLATFORMS,
  PLATFORM_META,
  SEGMENT_META,
  SEGMENT_ORDER,
  relativeTime,
} from '@/lib/format';
import { cn } from '@/lib/utils';

export interface MemberRow {
  id: string;
  displayName: string;
  composite: number;
  segment: AdvocateSegment;
  platforms: Platform[];
  lastSeen: string;
}

type SortKey = 'composite' | 'displayName' | 'lastSeen';

export function MembersTable({ slug, rows }: { slug: string; rows: MemberRow[] }) {
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<string>('all');
  const [platform, setPlatform] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('composite');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (q && !r.displayName.toLowerCase().includes(q)) return false;
      if (segment !== 'all' && r.segment !== segment) return false;
      if (platform !== 'all' && !r.platforms.includes(platform as Platform)) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'composite') cmp = a.composite - b.composite;
      else if (sortKey === 'displayName') cmp = a.displayName.localeCompare(b.displayName);
      else cmp = new Date(a.lastSeen).getTime() - new Date(b.lastSeen).getTime();
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [rows, search, segment, platform, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'displayName' ? 'asc' : 'desc');
    }
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-3">
          <Select value={segment} onChange={(e) => setSegment(e.target.value)} className="w-[150px]">
            <option value="all">All segments</option>
            {SEGMENT_ORDER.map((s) => (
              <option key={s} value={s}>
                {SEGMENT_META[s].label}
              </option>
            ))}
          </Select>
          <Select value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-[150px]">
            <option value="all">All platforms</option>
            {ALL_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_META[p].label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border/80 bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">
                <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('displayName')}>
                  Member <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="px-4 py-3 font-medium">
                <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('composite')}>
                  Score <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="px-4 py-3 font-medium">Segment</th>
              <th className="px-4 py-3 font-medium">Platforms</th>
              <th className="px-4 py-3 font-medium">
                <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('lastSeen')}>
                  Last active <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.id}
                onClick={() => setSelected(r.id)}
                className="cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-secondary/40"
              >
                <td className="px-4 py-3 font-medium">{r.displayName}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-7 tabular-nums">{r.composite.toFixed(0)}</span>
                    <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.min(r.composite, 100)}%` }}
                      />
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge className={cn('border', SEGMENT_META[r.segment].badge)}>
                    {SEGMENT_META[r.segment].label}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {r.platforms.map((p) => {
                      const meta = PLATFORM_META[p];
                      const Icon = meta.icon;
                      return <Icon key={p} className={cn('h-4 w-4', meta.tint)} aria-label={meta.label} />;
                    })}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{relativeTime(r.lastSeen)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  No members match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {filtered.length} of {rows.length} members
      </p>

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && <MemberPanel slug={slug} memberId={selected} />}
      </Sheet>
    </div>
  );
}
