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

export interface DiscourseLinkedAccountRef {
  platform: 'GITHUB' | 'DISCORD';
  username?: string;
  platformUserId?: string;
}

/**
 * Shared author/category context carried on every Discourse ingest event.
 */
export interface DiscourseAuthorContext {
  authorUserId: string;
  authorUsername: string;
  authorDisplayName?: string;
  /** Explicit GitHub/Discord links declared on the author's Discourse profile. */
  linkedAccounts?: DiscourseLinkedAccountRef[];
  categoryId: number | null;
  categorySlug: string | null;
  /** True when the post/topic lives in a configured governance category. */
  governance: boolean;
}

export interface DiscourseTopicCreatedPayload extends DiscourseAuthorContext {
  topicId: string;
  title: string;
  slug: string;
  content: string;
  url: string;
  createdAt: string;
}

export interface DiscoursePostCreatedPayload extends DiscourseAuthorContext {
  postId: string;
  topicId: string;
  topicSlug: string | null;
  postNumber: number;
  content: string;
  url: string;
  createdAt: string;
}

export interface DiscourseSolutionAcceptedPayload extends DiscourseAuthorContext {
  postId: string;
  topicId: string;
  topicSlug: string | null;
  postNumber: number;
  url: string;
  createdAt: string;
}
