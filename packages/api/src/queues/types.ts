/**
 * Job type definitions for BullMQ queues
 */

export const jobTypes = [
  'ingest:discord',
  'ingest:github',
  'ingest:twitter',
  'compute:metrics',
  'agent:pulse',
  'agent:threat-scan',
] as const;

export type JobType = (typeof jobTypes)[number];

/**
 * Map a logical job type to a BullMQ-safe queue name.
 *
 * BullMQ uses ':' as its Redis key separator and rejects queue/worker names
 * containing it ("Queue name cannot contain :"). Our job types use ':' (e.g.
 * 'ingest:discord'), so we substitute '-' only at the Queue/Worker construction
 * boundary. Job *data* and job *names* keep the original ':' identifier, and as
 * long as producers and consumers both go through this mapping they resolve to
 * the same queue.
 */
export function toQueueName(jobType: string): string {
  return jobType.replace(/:/g, '-');
}

export interface IngestDiscordJobData {
  event: 'messageCreate' | 'guildMemberAdd' | 'guildMemberRemove' | 'messageReactionAdd';
  payload: unknown;
  clientId: string;
}

export interface IngestGitHubJobData {
  event: 'push' | 'pull_request' | 'issues' | 'issue_comment' | 'star' | 'fork';
  payload: unknown;
  clientId: string;
}

export interface IngestTwitterJobData {
  event: 'mention' | 'engagement' | 'follower_count';
  payload: unknown;
  clientId: string;
}

export interface ComputeMetricsJobData {
  clientId: string;
  period: 'hour' | 'day' | 'week';
}

export interface AgentPulseJobData {
  clientId: string;
  date?: string; // ISO date string, defaults to today
}

export interface AgentThreatScanJobData {
  clientId: string;
  platform?: 'DISCORD' | 'GITHUB' | 'TWITTER';
}

export type JobData =
  | IngestDiscordJobData
  | IngestGitHubJobData
  | IngestTwitterJobData
  | ComputeMetricsJobData
  | AgentPulseJobData
  | AgentThreatScanJobData;
