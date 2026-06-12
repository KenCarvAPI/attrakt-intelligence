/**
 * Claude-evaluated helpfulness component.
 *
 * For members above a minimum activity threshold, samples up to N recent
 * messages and asks Claude to rate (0-100) how much the member helps others.
 * Results are cached per member per period in HelpfulnessEvaluation so repeat
 * runs are cheap, and calls are batched + rate-limited. The core scoring
 * pipeline reads the cached scores back when computing composites.
 */
import { prisma, log, config, toPeriod, periodRange } from '@attrakt/core';
import { renderPrompt, HELPFULNESS_PROMPT_VERSION } from '../prompts';
import { createClaude, parseJsonResponse, runBatched, type CompleteFn } from '../claude';

export interface HelpfulnessOptions {
  /** ISO date selecting the week to evaluate. Defaults to now. */
  referenceDate?: Date;
  /** Minimum messages in the period for a member to be evaluated. Default 5. */
  minMessages?: number;
  /** Max messages sampled per member. Default 30. */
  sampleSize?: number;
  /** Members evaluated concurrently per batch. Default 5. */
  concurrency?: number;
  /** Delay between batches, ms (rate limiting). Default 1000. */
  delayMs?: number;
  /** Re-evaluate even if a cached result exists for the period. Default false. */
  force?: boolean;
  /** Injectable Claude call (defaults to the real API). */
  complete?: CompleteFn;
}

export interface HelpfulnessRunSummary {
  clientId: string;
  period: string;
  evaluated: number;
  cached: number;
  belowThreshold: number;
}

interface HelpfulnessResult {
  score: number;
  rationale: string;
}

/** Evaluate and cache helpfulness for all eligible members of a client. */
export async function evaluateHelpfulness(
  clientId: string,
  options: HelpfulnessOptions = {}
): Promise<HelpfulnessRunSummary> {
  const {
    referenceDate = new Date(),
    minMessages = 5,
    sampleSize = 30,
    concurrency = 5,
    delayMs = 1000,
    force = false,
    complete = createClaude(),
  } = options;

  const period = toPeriod(referenceDate);
  const { start, end } = periodRange(referenceDate);

  // Candidate members: those active in the period.
  const members = await prisma.member.findMany({
    where: { clientId, messages: { some: { createdAt: { gte: start, lt: end } } } },
    select: { id: true, displayName: true },
  });

  let belowThreshold = 0;
  let cached = 0;
  const toEvaluate: { id: string; displayName: string | null }[] = [];

  for (const member of members) {
    const messageCount = await prisma.message.count({
      where: { memberId: member.id, createdAt: { gte: start, lt: end } },
    });
    if (messageCount < minMessages) {
      belowThreshold += 1;
      continue;
    }
    if (!force) {
      const existing = await prisma.helpfulnessEvaluation.findUnique({
        where: { memberId_period: { memberId: member.id, period } },
        select: { id: true },
      });
      if (existing) {
        cached += 1;
        continue;
      }
    }
    toEvaluate.push(member);
  }

  log.info(
    { clientId, period, candidates: members.length, toEvaluate: toEvaluate.length, cached },
    'Evaluating helpfulness'
  );

  await runBatched(toEvaluate, concurrency, delayMs, async (member) => {
    const messages = await prisma.message.findMany({
      where: { memberId: member.id },
      orderBy: { createdAt: 'desc' },
      take: sampleSize,
      select: { content: true, platform: true, createdAt: true },
    });

    const platforms = [...new Set(messages.map((m) => m.platform))].join(', ') || 'unknown';
    const rendered = messages
      .map((m) => `[${m.createdAt.toISOString().slice(0, 10)} ${m.platform}] ${m.content}`)
      .join('\n');

    const prompt = renderPrompt(HELPFULNESS_PROMPT_VERSION, {
      displayName: member.displayName ?? 'Unknown',
      platforms,
      sampleSize: String(messages.length),
      messages: rendered,
    });

    try {
      const raw = await complete(prompt, 300);
      const result = parseJsonResponse<HelpfulnessResult>(raw);
      const score = Math.max(0, Math.min(100, Number(result.score)));

      await prisma.helpfulnessEvaluation.upsert({
        where: { memberId_period: { memberId: member.id, period } },
        update: {
          score,
          rationale: result.rationale ?? null,
          sampleSize: messages.length,
          model: config.claudeModel,
          promptVersion: HELPFULNESS_PROMPT_VERSION,
        },
        create: {
          memberId: member.id,
          clientId,
          period,
          score,
          rationale: result.rationale ?? null,
          sampleSize: messages.length,
          model: config.claudeModel,
          promptVersion: HELPFULNESS_PROMPT_VERSION,
        },
      });
    } catch (error) {
      log.error({ error, memberId: member.id }, 'Helpfulness evaluation failed for member');
    }
  });

  const summary: HelpfulnessRunSummary = {
    clientId,
    period,
    evaluated: toEvaluate.length,
    cached,
    belowThreshold,
  };
  log.info({ ...summary }, 'Helpfulness evaluation complete');
  return summary;
}
