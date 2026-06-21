import { Plug, CheckCircle2, AlertCircle, CircleSlash } from 'lucide-react';
import type { ContextSource } from '@prisma/client';
import { shortDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';

const DOMAIN_LABELS: Record<string, string> = {
  STRATEGY: 'Strategy & brand',
  PRODUCT: 'Product',
  COMMUNITY: 'Community & ecosystem',
  MARKETING_OPS: 'Marketing ops',
  MARKETING_DATA: 'Marketing data',
};

function humanize(s: string) {
  return s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'connected') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === 'error') return <AlertCircle className="h-4 w-4 text-destructive" />;
  return <CircleSlash className="h-4 w-4 text-muted-foreground" />;
}

/**
 * Connections section of the Context Engine: the data sources feeding the
 * intelligence layer. CE-0 ships the store + the panel; sources are provisioned
 * by Attrakt (CLI) for now, with in-UI connect flows arriving with the SaaS
 * connectors (CE-1+).
 */
export function ConnectionsPanel({
  sources,
  itemCount,
}: {
  sources: ContextSource[];
  itemCount: number;
}) {
  if (sources.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-secondary/20 p-6 text-sm text-muted-foreground">
        <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
          <Plug className="h-4 w-4" /> No live connections yet
        </div>
        Manual knowledge uploads below already feed the context store
        {itemCount > 0 ? ` (${itemCount} item${itemCount === 1 ? '' : 's'} indexed)` : ''}. Connect
        data sources (product, community, marketing ops &amp; performance) to ground outputs in live
        data — Attrakt provisions these during onboarding.
      </div>
    );
  }

  // Group by domain.
  const byDomain = new Map<string, ContextSource[]>();
  for (const s of sources) {
    const arr = byDomain.get(s.domain) ?? [];
    arr.push(s);
    byDomain.set(s.domain, arr);
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">{itemCount} item(s) indexed across all sources.</p>
      {[...byDomain.entries()].map(([domain, list]) => (
        <div key={domain}>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {DOMAIN_LABELS[domain] ?? domain}
          </h3>
          <ul className="divide-y divide-border/60">
            {list.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <StatusIcon status={s.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.label ?? humanize(s.connector)}</p>
                  <p className="text-xs text-muted-foreground">
                    {humanize(s.connector)}
                    {s.lastSyncedAt ? ` · synced ${shortDate(s.lastSyncedAt)}` : ' · never synced'}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={s.status === 'error' ? 'border-destructive/40 text-destructive' : undefined}
                >
                  {s.status}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
