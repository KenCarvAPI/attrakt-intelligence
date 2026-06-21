import { notFound } from 'next/navigation';
import { getClient } from '@/lib/queries';
import { NavTabs } from '@/components/nav-tabs';

export const dynamic = 'force-dynamic';

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { clientSlug: string };
}) {
  const client = await getClient(params.clientSlug);
  if (!client) notFound();

  return (
    <div className="app-wash min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-sm font-semibold text-primary">
              {client.name.charAt(0)}
            </div>
            <span className="text-sm font-semibold tracking-tight">{client.name}</span>
            <span className="text-border">/</span>
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Intelligence</span>
          </div>
          <NavTabs slug={client.slug} />
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-6 py-10">{children}</main>
    </div>
  );
}
