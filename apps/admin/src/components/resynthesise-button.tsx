'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ResynthesiseButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    await fetch(`/api/${slug}/context/resynthesise`, { method: 'POST' });
    setBusy(false);
    router.refresh();
  }

  return (
    <Button size="sm" variant="outline" onClick={run} disabled={busy}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
      Re-synthesise
    </Button>
  );
}
