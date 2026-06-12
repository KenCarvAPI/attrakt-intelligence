/**
 * Context Synthesis Agent
 *
 * Reads all KnowledgeDocuments for a client and produces (or refreshes) a
 * structured ContextProfile via map-reduce:
 *   1. MAP    — summarise each document (keeps large sets within context limits)
 *   2. REDUCE — synthesise the five profile sections across summaries, treating
 *               leadership_interview + strategy_doc as authoritative for the
 *               strategicDirection section.
 *
 * Synthesis always creates a NEW draft version. Activation promotes a version to
 * `active` and archives the previously active one.
 *
 * Uses Claude (central model constant) when ANTHROPIC_API_KEY is configured;
 * otherwise falls back to deterministic extractive synthesis so the pipeline
 * still produces a populated, grounded profile.
 */

import type { ContextProfile, KnowledgeDocument, KnowledgeSourceType } from '@prisma/client';
import { prisma, log } from '@attrakt/core';
import { callClaude, extractJson, isLLMAvailable, loadPrompt } from '../llm';

// Per-document summary cap (chars) fed into the reduce step.
const SUMMARY_CHAR_CAP = 1500;

interface DocSummary {
  title: string;
  sourceType: KnowledgeSourceType;
  summary: string;
}

interface SectionConfidence {
  level: 'high' | 'medium' | 'low';
  note: string;
}

export interface SynthesisedSections {
  products: Record<string, unknown> & { confidence: SectionConfidence };
  brandVoice: Record<string, unknown> & { confidence: SectionConfidence };
  audience: Record<string, unknown> & { confidence: SectionConfidence };
  marketingFunction: Record<string, unknown> & { confidence: SectionConfidence };
  strategicDirection: Record<string, unknown> & { confidence: SectionConfidence };
}

export interface SynthesisResult {
  profile: ContextProfile;
  documentCount: number;
  usedLLM: boolean;
}

// ---------------------------------------------------------------------------
// MAP: per-document summaries
// ---------------------------------------------------------------------------

async function summariseDocument(doc: KnowledgeDocument): Promise<DocSummary> {
  if (isLLMAvailable()) {
    try {
      const summary = await callClaude({
        system: 'You are a precise analyst who never invents facts.',
        user: loadPrompt('context-summarise-document.v1.md', {
          SOURCE_TYPE: doc.sourceType,
          TITLE: doc.title,
          TEXT: doc.rawText.slice(0, 12000),
        }),
        maxTokens: 1024,
      });
      return { title: doc.title, sourceType: doc.sourceType, summary };
    } catch (error) {
      log.warn({ error, documentId: doc.id }, 'LLM summarise failed; using extractive fallback');
    }
  }
  return { title: doc.title, sourceType: doc.sourceType, summary: extractiveSummary(doc.rawText) };
}

/** Deterministic fallback: pull bullet-like lines and lead sentences. */
function extractiveSummary(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#')); // drop markdown headings
  const bullets = lines.filter((l) => /^[-*•\d]/.test(l) || l.length < 160);
  const picked = (bullets.length >= 3 ? bullets : lines).slice(0, 12);
  return picked.join('\n').slice(0, SUMMARY_CHAR_CAP);
}

// ---------------------------------------------------------------------------
// REDUCE: synthesise the profile sections
// ---------------------------------------------------------------------------

function groupSummaries(summaries: DocSummary[]): string {
  const byType = new Map<string, DocSummary[]>();
  for (const s of summaries) {
    const arr = byType.get(s.sourceType) ?? [];
    arr.push(s);
    byType.set(s.sourceType, arr);
  }
  const blocks: string[] = [];
  for (const [type, docs] of byType) {
    blocks.push(`### Source type: ${type}`);
    for (const d of docs) {
      blocks.push(`- [${d.title}]\n${d.summary}`);
    }
  }
  return blocks.join('\n\n');
}

async function synthesise(summaries: DocSummary[]): Promise<SynthesisedSections> {
  if (isLLMAvailable()) {
    try {
      const raw = await callClaude({
        system: 'You output only valid JSON matching the requested schema exactly.',
        user: loadPrompt('context-synthesise-profile.v1.md', {
          GROUPED_SUMMARIES: groupSummaries(summaries),
        }),
        maxTokens: 8192,
      });
      return normaliseSections(extractJson<Partial<SynthesisedSections>>(raw));
    } catch (error) {
      log.warn({ error }, 'LLM synthesis failed; using deterministic fallback');
    }
  }
  return deterministicSynthesis(summaries);
}

function defaultConfidence(): SectionConfidence {
  return { level: 'low', note: 'Synthesised without confidence assessment.' };
}

function normaliseSections(input: Partial<SynthesisedSections>): SynthesisedSections {
  const ensure = (s?: Record<string, unknown> & { confidence?: SectionConfidence }) => ({
    ...(s ?? {}),
    confidence: (s?.confidence as SectionConfidence) ?? defaultConfidence(),
  });
  return {
    products: ensure(input.products),
    brandVoice: ensure(input.brandVoice),
    audience: ensure(input.audience),
    marketingFunction: ensure(input.marketingFunction),
    strategicDirection: ensure(input.strategicDirection),
  };
}

/** Map source types to the sections they primarily inform. */
const SECTION_SOURCES: Record<keyof SynthesisedSections, KnowledgeSourceType[]> = {
  products: ['product_docs', 'website', 'marketing_material'],
  brandVoice: ['brand_guidelines', 'marketing_material'],
  audience: ['marketing_material', 'website', 'leadership_interview'],
  marketingFunction: ['marketing_material', 'leadership_interview', 'strategy_doc'],
  strategicDirection: ['leadership_interview', 'strategy_doc'],
};

function bullets(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#')) // drop markdown headings
    .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((l) => l.length > 0)
    .slice(0, 8);
}

function confidenceFor(relevant: DocSummary[], authoritativeNote?: string): SectionConfidence {
  const level = relevant.length >= 2 ? 'high' : relevant.length === 1 ? 'medium' : 'low';
  const present = relevant.map((d) => d.sourceType);
  const note =
    relevant.length === 0
      ? 'No source documents directly inform this section.'
      : `Based on ${relevant.length} source doc(s): ${[...new Set(present)].join(', ')}.` +
        (authoritativeNote ? ` ${authoritativeNote}` : '');
  return { level, note };
}

/** Deterministic, source-grounded synthesis used when no LLM is available. */
function deterministicSynthesis(summaries: DocSummary[]): SynthesisedSections {
  const pick = (key: keyof SynthesisedSections) =>
    summaries.filter((s) => SECTION_SOURCES[key].includes(s.sourceType));

  const products = pick('products');
  const brand = pick('brandVoice');
  const audience = pick('audience');
  const marketing = pick('marketingFunction');
  const strategy = summaries.filter((s) =>
    ['leadership_interview', 'strategy_doc'].includes(s.sourceType)
  );

  const joinBullets = (docs: DocSummary[]) => docs.flatMap((d) => bullets(d.summary));

  return {
    products: {
      whatTheyAre: products[0]?.summary.split('\n')[0] ?? '',
      whoTheyServe: '',
      keyDifferentiators: joinBullets(products),
      confidence: confidenceFor(products),
    },
    brandVoice: {
      tone: brand[0]?.summary.split('\n')[0] ?? '',
      vocabulary: joinBullets(brand),
      thingsTheyNeverSay: joinBullets(brand).filter((b) => /never|avoid|don'?t|no /i.test(b)),
      confidence: confidenceFor(brand),
    },
    audience: {
      icps: joinBullets(audience),
      communities: [],
      whereTheyLiveOnline: joinBullets(audience).filter((b) =>
        /twitter|x |farcaster|discord|reddit|telegram|newsletter|youtube|linkedin/i.test(b)
      ),
      confidence: confidenceFor(audience),
    },
    marketingFunction: {
      teamShape: '',
      channelsInUse: joinBullets(marketing).filter((b) =>
        /twitter|x |farcaster|discord|email|newsletter|youtube|linkedin|content/i.test(b)
      ),
      currentCampaigns: joinBullets(marketing),
      confidence: confidenceFor(marketing),
    },
    strategicDirection: {
      leadershipPriorities: joinBullets(strategy),
      positioning: strategy.find((s) => /position|competitor|category/i.test(s.summary))
        ? bullets(strategy.find((s) => /position|competitor|category/i.test(s.summary))!.summary).join('; ')
        : '',
      upcomingBets: joinBullets(strategy).filter((b) => /will|plan|launch|expand|bet|next/i.test(b)),
      confidence: confidenceFor(
        strategy,
        'leadership_interview and strategy_doc treated as authoritative for this section.'
      ),
    },
  };
}

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

async function nextVersion(clientId: string): Promise<number> {
  const latest = await prisma.contextProfile.findFirst({
    where: { clientId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

/**
 * Synthesise a new DRAFT ContextProfile version for a client from all of their
 * knowledge documents.
 */
export async function synthesiseContextProfile(clientId: string): Promise<SynthesisResult> {
  const docs = await prisma.knowledgeDocument.findMany({
    where: { clientId },
    orderBy: { uploadedAt: 'asc' },
  });

  if (docs.length === 0) {
    throw new Error(`No knowledge documents found for client ${clientId}. Ingest some first.`);
  }

  const usedLLM = isLLMAvailable();
  log.info({ clientId, documentCount: docs.length, usedLLM }, 'Synthesising context profile');

  // MAP
  const summaries: DocSummary[] = [];
  for (const doc of docs) {
    summaries.push(await summariseDocument(doc));
  }

  // REDUCE
  const sections = await synthesise(summaries);

  const version = await nextVersion(clientId);
  const profile = await prisma.contextProfile.create({
    data: {
      clientId,
      version,
      status: 'draft',
      products: sections.products as object,
      brandVoice: sections.brandVoice as object,
      audience: sections.audience as object,
      marketingFunction: sections.marketingFunction as object,
      strategicDirection: sections.strategicDirection as object,
    },
  });

  log.info({ clientId, version, profileId: profile.id }, 'Created draft context profile');
  return { profile, documentCount: docs.length, usedLLM };
}

/**
 * Activate a specific version: mark it `active` and archive the previously
 * active profile. Enforced as a transaction; the partial unique index on
 * status='active' guarantees a single active profile per client.
 */
export async function activateContextProfile(
  clientId: string,
  version: number
): Promise<ContextProfile> {
  const target = await prisma.contextProfile.findUnique({
    where: { clientId_version: { clientId, version } },
  });
  if (!target) {
    throw new Error(`No context profile v${version} for client ${clientId}`);
  }

  return prisma.$transaction(async (tx) => {
    await tx.contextProfile.updateMany({
      where: { clientId, status: 'active', NOT: { id: target.id } },
      data: { status: 'archived' },
    });
    return tx.contextProfile.update({
      where: { id: target.id },
      data: { status: 'active' },
    });
  });
}
