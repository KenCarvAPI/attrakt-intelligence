import { FileText } from 'lucide-react';
import type { KnowledgeDocument } from '@prisma/client';
import { shortDate } from '@/lib/format';

function humanizeType(t: string) {
  return t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function KnowledgeList({ documents }: { documents: KnowledgeDocument[] }) {
  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">No documents yet. Add source material to ground the profile.</p>;
  }
  return (
    <ul className="divide-y divide-border/60">
      {documents.map((d) => (
        <li key={d.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/50">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{d.title}</p>
            <p className="text-xs text-muted-foreground">
              {humanizeType(d.sourceType)} · {shortDate(d.uploadedAt)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
