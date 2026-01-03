import { Octokit } from 'octokit';
import { config } from '../config';
import { PlatformClientError } from '../errors';
import { log } from '../logger';

let octokit: Octokit | null = null;

export function getGitHubClient(): Octokit {
  if (octokit) {
    return octokit;
  }

  try {
    const token = config.githubToken;
    if (!token) {
      throw new PlatformClientError('GITHUB_TOKEN or GITHUB_PAT is required', 'GITHUB', false);
    }

    octokit = new Octokit({ auth: token });
    log.info({ platform: 'GITHUB' }, 'GitHub client initialized');
    return octokit;
  } catch (error) {
    log.error({ error, platform: 'GITHUB' }, 'Failed to initialize GitHub client');
    throw error;
  }
}
