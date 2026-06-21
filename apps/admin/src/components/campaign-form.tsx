'use client';

import { useState } from 'react';
import { Loader2, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface CampaignContent {
  objective: string;
  positioning?: string;
  audienceFit?: string;
  advocates?: { name: string; platform: string; score: number; why: string }[];
  channels?: { channel: string; priority: string; rationale: string }[];
  messageAngles?: { angle: string; copy: string; voiceCheck: string }[];
  generatedWith?: string;
  contextProfileVersion?: number | null;
  runningWithoutContext?: boolean;
}

const PRIORITY_STYLE: Record<string, string> = {
  high: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  medium: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
  low: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25',
};

function BriefView({ content }: { content: CampaignContent }) {
  return (
    <div className="mt-6 space-y-5 border-t border-border pt-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Objective</p>
        <p className="mt-1 font-medium">{content.objective}</p>
      </div>
      {content.positioning && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Positioning</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/80">{content.positioning}</p>
        </div>
      )}

      {content.advocates && content.advocates.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Advocates to activate</p>
          <ul className="space-y-1.5">
            {content.advocates.map((a, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{a.name}</span>
                <span className="flex-1 truncate px-3 text-muted-foreground">{a.why}</span>
                <span className="tabular-nums text-muted-foreground">{a.score}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {content.channels && content.channels.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Channels</p>
          <div className="flex flex-wrap gap-2">
            {content.channels.map((c, i) => (
              <span
                key={i}
                className={`rounded-md border px-2 py-0.5 text-xs ${PRIORITY_STYLE[c.priority] ?? PRIORITY_STYLE.low}`}
              >
                {c.channel}
              </span>
            ))}
          </div>
        </div>
      )}

      {content.messageAngles && content.messageAngles.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Message angles</p>
          <div className="space-y-2">
            {content.messageAngles.map((m, i) => (
              <div key={i} className="rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-xs font-semibold text-primary">{m.angle}</p>
                <p className="mt-1 text-sm text-foreground/90">{m.copy}</p>
                <p className="mt-1 text-xs italic text-muted-foreground">{m.voiceCheck}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {content.runningWithoutContext
          ? 'Generated without an active context profile.'
          : `Grounded in context profile v${content.contextProfileVersion}.`}{' '}
        · {content.generatedWith}
      </p>
    </div>
  );
}

export function CampaignForm({
  slug,
  initial,
}: {
  slug: string;
  initial: CampaignContent | null;
}) {
  const [objective, setObjective] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<CampaignContent | null>(initial);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!objective.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/${slug}/context/campaign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const body = await res.json();
      if (!body?.content) throw new Error('No brief was returned.');
      setContent(body.content);
      setObjective('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate the brief.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={submit} className="flex gap-3">
        <Input
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="Campaign objective, e.g. grow delegate participation in Q3…"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !objective.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
          Generate
        </Button>
      </form>

      {busy && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-secondary/30 p-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Building the brief — pulling advocates, channels, and on-brand angles. This can take a few seconds.
        </div>
      )}
      {error && !busy && (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {content && !busy && <BriefView content={content} />}
    </div>
  );
}
