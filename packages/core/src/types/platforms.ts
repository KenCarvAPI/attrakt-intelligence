export interface DiscordMessagePayload {
  id: string;
  channelId: string;
  guildId: string | null;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string | null;
  content: string;
  timestamp: number;
  editedTimestamp: number | null;
  embeds: Array<{
    title?: string;
    description?: string;
    url?: string;
  }>;
  attachments: Array<{
    url: string;
    filename: string | null;
  }>;
}

export interface DiscordMemberPayload {
  userId: string;
  username: string;
  displayName?: string;
  guildId: string;
  joinedTimestamp?: number;
  leftTimestamp?: number;
}

export interface DiscordReactionPayload {
  messageId: string;
  channelId: string;
  guildId: string | null;
  userId: string;
  emoji: string;
  timestamp: number;
}

export interface GitHubPushPayload {
  pusher?: {
    name: string;
    email?: string;
  };
  sender?: {
    id: number;
    login: string;
    email?: string;
  };
  commits: Array<{
    id: string;
    message: string;
    url: string;
    timestamp?: string;
  }>;
  repository?: {
    full_name: string;
  };
  ref?: string;
}

export interface GitHubPullRequestPayload {
  number: number;
  title: string;
  state: string;
  user?: {
    id: number;
    login: string;
  };
  merged: boolean;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  html_url: string;
}

export interface GitHubIssuePayload {
  number: number;
  title: string;
  state: string;
  user?: {
    id: number;
    login: string;
  };
  labels?: Array<{ name: string } | string>;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface TwitterMentionPayload {
  tweetId: string;
  text: string;
  authorId: string;
  createdAt: string;
  query: string;
  trackedAccount: string;
}

export interface TwitterFollowerCountPayload {
  username: string;
  userId: string;
  followerCount: number;
  followingCount: number;
  tweetCount: number;
  timestamp: number;
}

/** A single Discourse post (topic OP or reply) queued for ingestion. */
export interface DiscoursePostPayload {
  baseUrl: string;
  postId: number;
  topicId: number;
  topicTitle: string;
  postNumber: number; // 1 = topic's opening post
  userId: number;
  username: string;
  displayName?: string | null;
  content: string; // plain text (HTML stripped)
  createdAt: string;
  replyCount: number;
  acceptedAnswer: boolean;
  categoryId: number | null;
  categorySlug?: string | null;
  isGovernance: boolean;
  /** Explicit external accounts from the author's profile (high-confidence). */
  linkedAccounts?: Array<{ platform: 'DISCORD' | 'GITHUB' | 'TWITTER'; username?: string }>;
}
