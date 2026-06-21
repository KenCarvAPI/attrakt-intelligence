import { NextResponse } from 'next/server';
import { getClient, getMemberDetail } from '@/lib/queries';
import { regenerateBrief } from '@/lib/generate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { clientSlug: string; memberId: string } }
) {
  const client = await getClient(params.clientSlug);
  if (!client) return NextResponse.json({ error: 'client_not_found' }, { status: 404 });
  const detail = await getMemberDetail(client.id, params.memberId);
  if (!detail) return NextResponse.json({ error: 'member_not_found' }, { status: 404 });
  return NextResponse.json(detail);
}

export async function POST(
  _req: Request,
  { params }: { params: { clientSlug: string; memberId: string } }
) {
  const client = await getClient(params.clientSlug);
  if (!client) return NextResponse.json({ error: 'client_not_found' }, { status: 404 });
  await regenerateBrief(client.id, params.memberId);
  const detail = await getMemberDetail(client.id, params.memberId);
  return NextResponse.json(detail);
}
