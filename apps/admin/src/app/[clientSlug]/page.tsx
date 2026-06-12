import { notFound } from 'next/navigation';
import { getClient, getOverview } from '@/lib/queries';
import { MetricCard } from '@/components/metric-card';
import { ActivityChart } from '@/components/activity-chart';
import { SegmentBar } from '@/components/segment-bar';
import { PlatformBreakdown } from '@/components/platform-breakdown';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function OverviewPage({ params }: { params: { clientSlug: string } }) {
  const client = await getClient(params.clientSlug);
  if (!client) notFound();
  const data = await getOverview(client.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Community health across all platforms — trailing 30 days.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active members" current={data.activeMembers.current} prior={data.activeMembers.prior} />
        <MetricCard label="New members" current={data.newMembers.current} prior={data.newMembers.prior} />
        <MetricCard label="Messages" current={data.messages.current} prior={data.messages.prior} />
        <MetricCard label="Governance posts" current={data.governance.current} prior={data.governance.prior} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Messages and engagement events per day, last 90 days.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityChart data={data.activitySeries} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Segment distribution</CardTitle>
            <CardDescription>Members by advocacy segment (current period).</CardDescription>
          </CardHeader>
          <CardContent>
            <SegmentBar data={data.segments} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Messages by platform</CardTitle>
            <CardDescription>Where the conversation happens — last 30 days.</CardDescription>
          </CardHeader>
          <CardContent>
            <PlatformBreakdown data={data.messagesByPlatform} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
