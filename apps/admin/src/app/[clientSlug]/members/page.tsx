import { notFound } from 'next/navigation';
import { getClient, listMembers } from '@/lib/queries';
import { MembersTable, type MemberRow } from '@/components/members-table';

export const dynamic = 'force-dynamic';

export default async function MembersPage({ params }: { params: { clientSlug: string } }) {
  const client = await getClient(params.clientSlug);
  if (!client) notFound();
  const members = await listMembers(client.id);

  const rows: MemberRow[] = members.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    composite: m.composite,
    segment: m.segment,
    platforms: m.platforms,
    lastSeen: m.lastSeen.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Unified identities ranked by composite advocacy score. Select a member for the full profile.
        </p>
      </div>
      <MembersTable slug={client.slug} rows={rows} />
    </div>
  );
}
