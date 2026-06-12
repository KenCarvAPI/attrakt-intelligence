/**
 * Loader for the versioned prompt templates kept in `packages/agents/prompts/`.
 *
 * Templates live as `<name>.<version>.md` next to the package root (outside
 * `src/`, so they are human-editable docs rather than compiled code) and are
 * read at runtime. Bump the version (and add a new file) when changing a
 * prompt so generated artifacts stay traceable to the exact template.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const WEEKLY_HEALTH_REPORT_VERSION = 'v1';

// From either src/ (tsx) or dist/ (built), `../prompts` resolves to the
// package's prompts directory.
const PROMPTS_DIR = join(__dirname, '..', 'prompts');

/** Load a prompt template's raw text by base name and version. */
export function loadPromptTemplate(name: string, version: string): string {
  return readFileSync(join(PROMPTS_DIR, `${name}.${version}.md`), 'utf8');
}

/**
 * Fill `{{placeholder}}` tokens in a template. Unknown tokens are left intact
 * so missing data is obvious rather than silently blank.
 */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    key in values ? values[key] : match
  );
}

/** Convenience loader for the current weekly health report prompt. */
export function getWeeklyHealthReportPrompt(values: Record<string, string>): {
  version: string;
  prompt: string;
} {
  const template = loadPromptTemplate('weekly-health-report', WEEKLY_HEALTH_REPORT_VERSION);
  return {
    version: WEEKLY_HEALTH_REPORT_VERSION,
    prompt: fillTemplate(template, values),
  };
}
