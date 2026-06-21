'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

const SOURCE_TYPES = [
  'product_docs',
  'brand_guidelines',
  'marketing_material',
  'leadership_interview',
  'strategy_doc',
  'website',
  'other',
];

export function IntakeForm({ slug }: { slug: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState('product_docs');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setContent(await file.text());
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/${slug}/context/knowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, sourceType, content }),
    });
    setBusy(false);
    if (res.ok) {
      const body = await res.json();
      setMsg(body.deduped ? 'Already ingested (duplicate content).' : 'Document added.');
      setTitle('');
      setContent('');
      router.refresh();
    } else {
      setMsg('Failed to add document.');
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex gap-3">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="doc-title">Title</Label>
          <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Brand guidelines 2026" />
        </div>
        <div className="w-[180px] space-y-1.5">
          <Label htmlFor="doc-type">Type</Label>
          <Select id="doc-type" value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="doc-content">Paste content</Label>
        <Textarea
          id="doc-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste source text, or upload a .txt / .md file…"
          className="min-h-[120px]"
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept=".txt,.md,.markdown,text/*" className="hidden" onChange={onFile} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Upload file
          </Button>
          {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
        </div>
        <Button type="submit" size="sm" disabled={busy || !title.trim() || !content.trim()}>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Add document
        </Button>
      </div>
    </form>
  );
}
