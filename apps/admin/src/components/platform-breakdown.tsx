import type { Platform } from '@prisma/client';
import { PLATFORM_META, PLATFORM_CHART_COLOR, fullNumber } from '@/lib/format';

export function PlatformBreakdown({ data }: { data: { platform: Platform; count: number }[] }) {
  const withCounts = data.filter((d) => d.count > 0);
  if (withCounts.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No messages ingested in the last 30 days yet.
      </p>
    );
  }
  const total = withCounts.reduce((s, d) => s + d.count, 0) || 1;
  return (
    <div className="space-y-4">
      {withCounts.map(({ platform, count }) => {
        const meta = PLATFORM_META[platform];
        const Icon = meta.icon;
        const pct = (count / total) * 100;
        return (
          <div key={platform}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${meta.tint}`} />
                <span className="text-foreground/90">{meta.label}</span>
              </span>
              <span className="tabular-nums text-muted-foreground">
                {fullNumber(count)} <span className="text-xs">({Math.round(pct)}%)</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              {/* Consistent per-platform colour across the dashboard. */}
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: PLATFORM_CHART_COLOR[platform] }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
