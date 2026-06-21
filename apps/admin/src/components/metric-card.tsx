import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { deltaPct, fullNumber, signedPct } from '@/lib/format';

export function MetricCard({
  label,
  current,
  prior,
  invert = false,
  hint,
}: {
  label: string;
  current: number;
  prior: number;
  /** When true, a decrease is "good" (green). */
  invert?: boolean;
  hint?: string;
}) {
  const delta = deltaPct(current, prior);
  const up = delta !== null && delta > 0.5;
  const down = delta !== null && delta < -0.5;
  const good = invert ? down : up;
  const bad = invert ? up : down;

  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="mt-2 flex items-end justify-between">
          <span className="text-3xl font-semibold tracking-tight tabular-nums">{fullNumber(current)}</span>
          <div
            className={cn(
              'mb-1 flex items-center gap-0.5 text-xs font-medium tabular-nums',
              good && 'text-emerald-400',
              bad && 'text-rose-400',
              !good && !bad && 'text-muted-foreground'
            )}
          >
            {delta === null ? (
              <>
                <Minus className="h-3.5 w-3.5" /> new
              </>
            ) : (
              <>
                {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : down ? <ArrowDownRight className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                {signedPct(Math.round(delta))}
              </>
            )}
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{hint ?? 'vs. prior 30 days'}</p>
      </CardContent>
    </Card>
  );
}
