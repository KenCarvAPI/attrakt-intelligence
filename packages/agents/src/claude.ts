/**
 * Thin, injectable wrapper around the Anthropic client.
 *
 * All Claude calls in the scoring features go through a `CompleteFn` so that:
 *   - the model is sourced from one place (config.claudeModel), and
 *   - tests can inject a deterministic stub instead of hitting the network.
 */
import { Anthropic } from '@anthropic-ai/sdk';
import { config } from '@attrakt/core';

/** Send a single user prompt to Claude and return the text response. */
export type CompleteFn = (prompt: string, maxTokens: number) => Promise<string>;

/**
 * Build a CompleteFn backed by the real Anthropic API. The model defaults to
 * the centralised config.claudeModel (claude-sonnet-4-6).
 */
export function createClaude(model: string = config.claudeModel): CompleteFn {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is required for Claude-backed scoring features');
  }
  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

  return async (prompt: string, maxTokens: number) => {
    const message = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = message.content[0];
    return block && block.type === 'text' ? block.text : '';
  };
}

/**
 * Parse a JSON object out of a Claude response, tolerating ```json fences or
 * surrounding prose. Throws if no JSON object can be found/parsed.
 */
export function parseJsonResponse<T>(text: string): T {
  const fenced = text.replace(/```(?:json)?/gi, '').trim();
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON object found in Claude response: ${text.slice(0, 200)}`);
  }
  return JSON.parse(fenced.slice(start, end + 1)) as T;
}

/** Run an async mapper over items in batches, pausing between batches to rate-limit. */
export async function runBatched<T, R>(
  items: T[],
  batchSize: number,
  delayMs: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...(await Promise.all(batch.map(fn))));
    if (delayMs > 0 && i + batchSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return results;
}
