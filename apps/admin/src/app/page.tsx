import { redirect } from 'next/navigation';
import { listClients } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  const clients = await listClients();
  if (clients.length > 0) redirect(`/${clients[0].slug}`);
  // No clients seeded yet.
  return (
    <main className="app-wash flex min-h-screen items-center justify-center p-6 text-center">
      <div className="max-w-md">
        <h1 className="text-lg font-semibold">No client data yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Run <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">pnpm seed:demo</code> to
          generate the demo dataset, then refresh.
        </p>
      </div>
    </main>
  );
}
