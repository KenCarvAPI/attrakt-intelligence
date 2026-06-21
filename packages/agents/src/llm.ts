/**
 * Shared Claude helpers for agents.
 *
 * Centralises the model constant, prompt-template loading, a streaming call
 * wrapper (streaming avoids HTTP timeouts on long syntheses), and tolerant JSON
 * extraction. When ANTHROPIC_API_KEY is not configured, `isLLMAvailable()`
 * returns false and callers fall back to deterministic synthesis.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Anthropic } from '@anthropic-ai/sdk';
import { config, log, CLAUDE_MODEL } from '@attrakt/core';

let client: Anthropic | null = null;

export function isLLMAvailable(): boolean {
  return Boolean(config.anthropicApiKey);
}

function getClient(): Anthropic {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

const PROMPTS_DIR = join(__dirname, '..', 'prompts');

/** Load a versioned prompt template and substitute {{PLACEHOLDER}} tokens. */
export function loadPrompt(file: string, vars: Record<string, string> = {}): string {
  let template = readFileSync(join(PROMPTS_DIR, file), 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    template = template.split(`{{${key}}}`).join(value);
  }
  return template;
}

/**
 * Run a single Claude turn and return the concatenated text. Uses streaming +
 * adaptive thinking (the recommended setup for the current model) so large
 * syntheses don't hit request timeouts.
 */
export async function callClaude(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const stream = getClient().messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    thinking: { type: 'adaptive' },
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  } as any);

  const message = await stream.finalMessage();
  return message.content
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('')
    .trim();
}

/** Extract a JSON object from model output, tolerating ```json fences / prose. */
export function extractJson<T = unknown>(text: string): T {
  let candidate = text.trim();
  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidate = fence[1].trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    candidate = candidate.slice(start, end + 1);
  }
  try {
    return JSON.parse(candidate) as T;
  } catch (error) {
    log.error({ error, sample: candidate.slice(0, 200) }, 'Failed to parse model JSON');
    throw new Error('Model did not return valid JSON');
  }
}
