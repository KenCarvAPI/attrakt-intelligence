/**
 * Versioned prompt templates.
 *
 * Prompts live as files under packages/agents/prompts/<id>.md (e.g.
 * "helpfulness-v1.md") rather than as inline strings, so they can be reviewed,
 * diffed, and versioned independently of the code. The active version for each
 * use is exported as a constant below; bump the file + constant together to
 * roll a new version while keeping old briefs/evaluations attributable to the
 * prompt that produced them.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

/** Directory holding the prompt template files (package-root/prompts). */
const PROMPTS_DIR = join(__dirname, '..', 'prompts');

/** Active prompt versions. Bump alongside the corresponding template file. */
export const HELPFULNESS_PROMPT_VERSION = 'helpfulness-v1';
export const BRIEF_PROMPT_VERSION = 'advocate-brief-v1';

const cache = new Map<string, string>();

function loadTemplate(version: string): string {
  const cached = cache.get(version);
  if (cached) return cached;
  const template = readFileSync(join(PROMPTS_DIR, `${version}.md`), 'utf8');
  cache.set(version, template);
  return template;
}

/**
 * Render a prompt template, substituting `{{key}}` placeholders with the
 * provided values. Missing keys are replaced with an empty string.
 */
export function renderPrompt(version: string, vars: Record<string, string>): string {
  const template = loadTemplate(version);
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? '');
}
