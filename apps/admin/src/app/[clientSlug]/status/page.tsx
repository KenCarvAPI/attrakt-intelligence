import { notFound } from 'next/navigation';
import { CheckCircle2, XCircle, Clock, CircleDashed } from 'lucide-react';
import { getClient } from '@/lib/queries';
import { getIngestionStatus } from '@attrakt/core/src/services/ingestion-runs';
import { Card, CardContent } from '@/components/ui/card';
import { PLATFORM_META, fullNumber, relativeTime, shortDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

function StatusBadge({ status }: { status: string | undefined }) {
  if (status === 'success')
    return <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Healthy</span>;
  if (status === 'failed')
    return <span className="inline-flex items-center gap-1 text-rose-400"><XCircle className="h-4 w-4" /> Failed</span>;
  if (status === 'running')
    return <span className="inline-flex items-center gap-1 text-sky-400"><Clock className="h-4 w-4" /> Running</span>;
  return <span className="inline-flex items-center gap-1 text-muted-foreground"><CircleDashed className="h-4 w-4" /> No runs</span>;
}

export default async function StatusPage({ params }: { params: { clientSlug: string } }) {
  const client = await getClient(params.clientSlug);
  if (!client) notFound();
  const statuses = await getIngestionStatus(client.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ingestion status</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Last successful run, items ingested, and errors per platform.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {statuses.map(({ platform, lastRun, lastSuccess }) => {
          const meta = PLATFORM_META[platform];
          const Icon = meta.icon;
          return (
            <Card key={platform}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium">
                    <Icon className={`h-4 w-4 ${meta.tint}`} /> {meta.label}
                  </span>
                  <StatusBadge status={lastRun?.status} />
                </div>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Last successful run</dt>
                    <dd className="tabular-nums">
                      {lastSuccess ? (
                        <span title={shortDate(lastSuccess.finishedAt ?? lastSuccess.startedAt)}>
                          {relativeTime(lastSuccess.finishedAt ?? lastSuccess.startedAt)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Items ingested (last run)</dt>
                    <dd className="tabular-nums">{lastRun ? fullNumber(lastRun.itemsIngested) : '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Errors (last run)</dt>
                    <dd className={`tabular-nums ${lastRun && lastRun.errorCount > 0 ? 'text-rose-400' : ''}`}>
                      {lastRun ? fullNumber(lastRun.errorCount) : '—'}
                    </dd>
                  </div>
                  {lastRun?.mode && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Last run mode</dt>
                      <dd className="capitalize">{lastRun.mode}</dd>
                    </div>
                  )}
                  {lastRun?.error && (
                    <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                      {lastRun.error}
                    </p>
                  )}
                </dl>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
