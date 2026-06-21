/**
 * Context profile helpers shared by every external-facing output.
 *
 * The active ContextProfile is the client's synthesised understanding of their
 * products, brand voice, audience, marketing function, and strategic direction.
 * Pulse digests, advocate briefs, and campaign briefs load it and inject it as
 * grounding so recommendations reference the client's actual business rather
 * than generic community advice.
 */

import type { ContextProfile } from '@prisma/client';
import { prisma } from '../prisma';

/** Structured shape of a synthesised ContextProfile section. */
export interface ProfileSectionConfidence {
  level: 'high' | 'medium' | 'low';
  note: string;
}

/** Load the single active ContextProfile for a client, or null if none. */
export async function loadActiveContextProfile(
  clientId: string
): Promise<ContextProfile | null> {
  return prisma.contextProfile.findFirst({
    where: { clientId, status: 'active' },
    orderBy: { version: 'desc' },
  });
}

function section(profile: ContextProfile, key: keyof ContextProfile): Record<string, unknown> {
  const value = profile[key];
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function renderValue(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) {
    return value.map((v) => `  - ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function renderSection(title: string, data: Record<string, unknown>): string {
  const lines: string[] = [`## ${title}`];
  for (const [key, value] of Object.entries(data)) {
    if (key === 'confidence') continue;
    const rendered = renderValue(value);
    if (!rendered.trim()) continue;
    lines.push(rendered.includes('\n') ? `${key}:\n${rendered}` : `${key}: ${rendered}`);
  }
  return lines.join('\n');
}

/**
 * Render the active profile as a grounding block to prepend to an LLM prompt.
 * When no active profile exists, returns a clearly-labelled note so outputs can
 * flag that they are running without client context.
 */
export function formatContextForPrompt(profile: ContextProfile | null): string {
  if (!profile) {
    return [
      '## CLIENT CONTEXT',
      'No active ContextProfile exists for this client. You are running WITHOUT',
      'business context — keep recommendations general and explicitly note that',
      'they are not grounded in the client\'s products, audience, or strategy.',
    ].join('\n');
  }

  return [
    `## CLIENT CONTEXT (active profile v${profile.version})`,
    'Ground every recommendation in the following. Reference the client\'s actual',
    'products, audience, and strategic priorities — never generic community advice.',
    '',
    renderSection('Products', section(profile, 'products')),
    renderSection('Brand voice', section(profile, 'brandVoice')),
    renderSection('Audience', section(profile, 'audience')),
    renderSection('Marketing function', section(profile, 'marketingFunction')),
    renderSection('Strategic direction', section(profile, 'strategicDirection')),
  ].join('\n\n');
}

/** True when the client has no active context profile. */
export function isRunningWithoutContext(profile: ContextProfile | null): boolean {
  return profile == null;
}
