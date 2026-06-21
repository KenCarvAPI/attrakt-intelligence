import { NextResponse } from 'next/server';
import { getClient } from '@/lib/queries';
import { generateCampaign } from '@/lib/generate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { clientSlug: string } }) {
  const client = await getClient(params.clientSlug);
  if (!client) return NextResponse.json({ error: 'client_not_found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const objective = String(body?.objective ?? '').trim();
  if (!objective) return NextResponse.json({ error: 'objective_required' }, { status: 400 });

  const brief = await generateCampaign(client.id, objective);
  return NextResponse.json({ ok: true, content: brief.content });
}
