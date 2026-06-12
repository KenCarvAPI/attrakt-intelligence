import type { Platform } from '@prisma/client';
import { PLATFORM_META } from '@/lib/format';
import { fullNumber } from '@/lib/format';

export function PlatformBreakdown({ data }: { data: { platform: Platform; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  return (
    <div className="space-y-4">
      {data.map(({ platform, count }) => {
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
              <span className="tabular-nums text-muted-foreground">{fullNumber(count)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/80"
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
