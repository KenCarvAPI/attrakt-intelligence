'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import type { AdvocateSegment, Platform } from '@prisma/client';
import { SheetContent, SheetHeader } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PLATFORM_META, SEGMENT_META } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Identity {
  platform: Platform;
  username: string;
  displayName: string | null;
  matchMethod: string | null;
  matchConfidence: number | null;
}
interface Score {
  compositeScore: number;
  segment: AdvocateSegment;
  activityScore: number;
  consistencyScore: number;
  breadthScore: number;
  influenceScore: number;
  helpfulnessScore: number;
  period: string;
}
interface BriefContent {
  headline: string;
  whoTheyAre: string;
  activitySummary: string;
  topics: string[];
  evidenceOfAdvocacy: { date: string; example: string }[];
  suggestedNextAction: string;
}
interface Detail {
  id: string;
  displayName: string;
  email: string | null;
  walletAddress: string | null;
  identities: Identity[];
  score: Score | null;
  brief: { brief: BriefContent; model: string; promptVersion: string; createdAt: string } | null;
}

const COMPONENTS: { key: keyof Score; label: string }[] = [
  { key: 'activityScore', label: 'Activity' },
  { key: 'consistencyScore', label: 'Consistency' },
  { key: 'breadthScore', label: 'Breadth' },
  { key: 'influenceScore', label: 'Influence' },
  { key: 'helpfulnessScore', label: 'Helpfulness' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-5">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

export function MemberPanel({ slug, memberId }: { slug: string; memberId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/${slug}/members/${memberId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load member (${r.status})`);
        return r.json();
      })
      .then((d) => active && setDetail(d))
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Failed to load member'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [slug, memberId]);

  async function regenerate() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/${slug}/members/${memberId}`, { method: 'POST' });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setDetail(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to regenerate brief');
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <SheetContent className="overflow-y-auto p-0">
      {loading ? (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : error || !detail ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
          <p>{error ?? 'Member not found.'}</p>
        </div>
      ) : (
        <>
          <SheetHeader>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold tracking-tight">{detail.displayName}</h2>
              {detail.score && (
                <Badge className={cn('border', SEGMENT_META[detail.score.segment].badge)}>
                  {SEGMENT_META[detail.score.segment].label}
                </Badge>
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">
                {detail.score ? detail.score.compositeScore.toFixed(0) : '—'}
              </span>
              <span className="text-sm text-muted-foreground">/ 100 composite advocacy score</span>
            </div>
          </SheetHeader>

          <div className="divide-y divide-border">
            {/* Identities */}
            <Section title="Linked platform identities">
              <ul className="space-y-2.5">
                {detail.identities.map((id, i) => {
                  const meta = PLATFORM_META[id.platform];
                  const Icon = meta.icon;
                  const conf = id.matchConfidence ?? 1;
                  return (
                    <li key={i} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2.5">
                        <Icon className={cn('h-4 w-4', meta.tint)} />
                        <span className="font-medium">@{id.username}</span>
                        <span className="text-xs text-muted-foreground">{id.matchMethod ?? 'unknown'}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-emerald-400/80"
                            style={{ width: `${Math.round(conf * 100)}%` }}
                          />
                        </span>
                        <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                          {Math.round(conf * 100)}%
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Section>

            {/* Score breakdown */}
            {detail.score && (
              <Section title="Score breakdown">
                <div className="space-y-3">
                  {COMPONENTS.map(({ key, label }) => {
                    const value = detail.score![key] as number;
                    return (
                      <div key={key}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="text-foreground/90">{label}</span>
                          <span className="tabular-nums text-muted-foreground">{value.toFixed(0)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary/80"
                            style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* Brief */}
            <Section title="Advocate brief">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  {detail.brief ? 'Latest brief' : 'No brief yet'}
                </p>
                <Button size="sm" variant="outline" onClick={regenerate} disabled={regenerating}>
                  {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Regenerate brief
                </Button>
              </div>

              {detail.brief && (
                <div className="mt-4 space-y-4 text-sm">
                  <p className="font-medium leading-snug">{detail.brief.brief.headline}</p>
                  <p className="leading-relaxed text-foreground/80">{detail.brief.brief.whoTheyAre}</p>
                  <p className="leading-relaxed text-muted-foreground">{detail.brief.brief.activitySummary}</p>

                  {detail.brief.brief.topics?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {detail.brief.brief.topics.map((t) => (
                        <Badge key={t} variant="muted">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {detail.brief.brief.evidenceOfAdvocacy?.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Evidence
                      </p>
                      <ul className="space-y-2 border-l border-border pl-3">
                        {detail.brief.brief.evidenceOfAdvocacy.map((e, i) => (
                          <li key={i} className="text-foreground/75">
                            <span className="text-xs tabular-nums text-muted-foreground">{e.date}</span> — {e.example}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="rounded-lg border border-border bg-secondary/40 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Suggested next action</p>
                    <p className="mt-1 text-foreground/90">{detail.brief.brief.suggestedNextAction}</p>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {detail.brief.model} · {detail.brief.promptVersion}
                  </p>
                </div>
              )}
            </Section>
          </div>
        </>
      )}
    </SheetContent>
  );
}
