/**
 * Central model constant for all Claude-powered agents and synthesis.
 *
 * Single source of truth: derived from `config.claudeModel` (default
 * claude-sonnet-4-6, overridable via the CLAUDE_MODEL env var) so the model is
 * defined once and imported everywhere. Change it in config, not here.
 */
import { config } from './config';

export const CLAUDE_MODEL = config.claudeModel;
