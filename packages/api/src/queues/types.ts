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
