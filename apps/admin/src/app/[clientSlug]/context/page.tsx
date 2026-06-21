import { notFound } from 'next/navigation';
import { getClient, getContext } from '@/lib/queries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ContextSections } from '@/components/context-sections';
import { KnowledgeList } from '@/components/knowledge-list';
import { IntakeForm } from '@/components/intake-form';
import { ResynthesiseButton } from '@/components/resynthesise-button';
import { CampaignForm } from '@/components/campaign-form';
import { ConnectionsPanel } from '@/components/connections-panel';

export const dynamic = 'force-dynamic';

export default async function ContextPage({ params }: { params: { clientSlug: string } }) {
  const client = await getClient(params.clientSlug);
  if (!client) notFound();
  const { profile, documents, campaign, sources, itemCount } = await getContext(client.id);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Context engine</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connections + synthesised understanding of {client.name} — the structured, queryable
            store that grounds every advocate and campaign output.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {profile && <Badge variant="outline">v{profile.version} · active</Badge>}
          <ResynthesiseButton slug={client.slug} />
        </div>
      </div>

      {/* Connections */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Connections</h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connected data sources</CardTitle>
            <CardDescription>
              Live sources feeding the intelligence layer across the five context domains.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConnectionsPanel sources={sources} itemCount={itemCount} />
          </CardContent>
        </Card>
      </section>

      {/* Active profile */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Active context profile</h2>
        {profile ? (
          <ContextSections profile={profile} />
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No active context profile. Add knowledge documents below, then Re-synthesise.
            </CardContent>
          </Card>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Knowledge documents */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Knowledge documents</CardTitle>
            <CardDescription>{documents.length} source document(s) feeding synthesis.</CardDescription>
          </CardHeader>
          <CardContent>
            <KnowledgeList documents={documents} />
          </CardContent>
        </Card>

        {/* Intake */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add knowledge</CardTitle>
            <CardDescription>Upload or paste source material, then re-synthesise.</CardDescription>
          </CardHeader>
          <CardContent>
            <IntakeForm slug={client.slug} />
          </CardContent>
        </Card>
      </div>

      {/* Campaign brief generator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate a campaign brief</CardTitle>
          <CardDescription>
            Turn an objective into a grounded brief — advocates to activate, channels, and on-brand message angles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CampaignForm
            slug={client.slug}
            initial={(campaign?.content as any) ?? null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
