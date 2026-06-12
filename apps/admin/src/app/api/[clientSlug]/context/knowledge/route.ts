import { NextResponse } from 'next/server';
import { ingestKnowledgeDocument, isKnowledgeSourceType } from '@attrakt/core/src/services/knowledge';
import { getClient } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: { clientSlug: string } }
) {
  const client = await getClient(params.clientSlug);
  if (!client) return NextResponse.json({ error: 'client_not_found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const title = String(body?.title ?? '').trim();
  const sourceType = String(body?.sourceType ?? '');
  const content = String(body?.content ?? '');

  if (!title || !content.trim()) {
    return NextResponse.json({ error: 'title_and_content_required' }, { status: 400 });
  }
  if (!isKnowledgeSourceType(sourceType)) {
    return NextResponse.json({ error: 'invalid_source_type' }, { status: 400 });
  }

  const result = await ingestKnowledgeDocument({
    clientId: client.id,
    title,
    sourceType,
    rawText: content,
  });

  return NextResponse.json({ ok: true, deduped: result.deduped, documentId: result.document.id });
}
