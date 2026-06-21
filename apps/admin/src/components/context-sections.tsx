import type { ContextProfile } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const SECTIONS: { field: keyof ContextProfile; title: string }[] = [
  { field: 'products', title: 'Products' },
  { field: 'brandVoice', title: 'Brand voice' },
  { field: 'audience', title: 'Audience' },
  { field: 'marketingFunction', title: 'Marketing function' },
  { field: 'strategicDirection', title: 'Strategic direction' },
];

const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  low: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25',
};

function humanize(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

function FieldValue({ value }: { value: unknown }) {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return (
      <ul className="mt-1 space-y-1">
        {value.map((v, i) => (
          <li key={i} className="flex gap-2 text-sm text-foreground/80">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
            <span>{typeof v === 'string' ? v : JSON.stringify(v)}</span>
          </li>
        ))}
      </ul>
    );
  }
  return <p className="mt-1 text-sm leading-relaxed text-foreground/80">{String(value)}</p>;
}

export function ContextSections({ profile }: { profile: ContextProfile }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {SECTIONS.map(({ field, title }) => {
        const data = (profile[field] as Record<string, unknown>) ?? {};
        const confidence = (data.confidence as { level?: string; note?: string }) ?? {};
        const entries = Object.entries(data).filter(([k]) => k !== 'confidence');
        const hasContent = entries.some(([, v]) => v != null && v !== '' && (!Array.isArray(v) || v.length > 0));

        return (
          <Card key={String(field)} className="flex flex-col">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">{title}</CardTitle>
              {confidence.level && (
                <span
                  className={cn(
                    'rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize',
                    CONFIDENCE_STYLE[confidence.level] ?? CONFIDENCE_STYLE.low
                  )}
                >
                  {confidence.level} confidence
                </span>
              )}
            </CardHeader>
            <CardContent className="flex-1 space-y-3">
              {hasContent ? (
                entries.map(([k, v]) =>
                  v == null || v === '' || (Array.isArray(v) && v.length === 0) ? null : (
                    <div key={k}>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {humanize(k)}
                      </p>
                      <FieldValue value={v} />
                    </div>
                  )
                )
              ) : (
                <p className="text-sm text-muted-foreground">No synthesised content for this section yet.</p>
              )}
              {confidence.note && (
                <p className="border-t border-border/60 pt-3 text-xs italic text-muted-foreground">
                  {confidence.note}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
