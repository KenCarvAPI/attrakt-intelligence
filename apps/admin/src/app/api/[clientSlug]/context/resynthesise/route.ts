import { NextResponse } from 'next/server';
import { getClient } from '@/lib/queries';
import { resynthesiseContext } from '@/lib/generate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { clientSlug: string } }) {
  const client = await getClient(params.clientSlug);
  if (!client) return NextResponse.json({ error: 'client_not_found' }, { status: 404 });
  try {
    const profile = await resynthesiseContext(client.id);
    return NextResponse.json({ ok: true, version: profile.version });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
