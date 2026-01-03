#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { prisma, getGitHubClient, log } from '@attrakt/core';

const octokit = getGitHubClient();

const server = new Server(
  {
    name: 'github-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'github_get_repo_stats',
        description: 'Get statistics for a GitHub repository',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
          },
          required: ['owner', 'repo'],
        },
      },
      {
        name: 'github_list_contributors',
        description: 'List contributors for a GitHub repository',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            period: { type: 'string', description: 'Time period (day, week, month, year)', default: 'month' },
          },
          required: ['owner', 'repo'],
        },
      },
      {
        name: 'github_get_issues',
        description: 'Get issues for a GitHub repository',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            state: { type: 'string', description: 'Issue state (open, closed, all)', default: 'open' },
            labels: { type: 'array', items: { type: 'string' }, description: 'Filter by labels' },
          },
          required: ['owner', 'repo'],
        },
      },
      {
        name: 'github_get_prs',
        description: 'Get pull requests for a GitHub repository',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            state: { type: 'string', description: 'PR state (open, closed, all)', default: 'open' },
          },
          required: ['owner', 'repo'],
        },
      },
      {
        name: 'github_get_commits',
        description: 'Get commits for a GitHub repository',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
            since: { type: 'string', description: 'ISO date string to fetch commits since' },
            author: { type: 'string', description: 'Filter by author username' },
            limit: { type: 'number', description: 'Maximum number of commits', default: 30 },
          },
          required: ['owner', 'repo'],
        },
      },
      {
        name: 'github_get_contributor',
        description: 'Get contributor information and activity',
        inputSchema: {
          type: 'object',
          properties: {
            username: { type: 'string', description: 'GitHub username' },
          },
          required: ['username'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'github_get_repo_stats': {
        const owner = args.owner as string;
        const repo = args.repo as string;

        const [repoData, issues, pulls, contributors] = await Promise.all([
          octokit.rest.repos.get({ owner, repo }),
          octokit.rest.issues.listForRepo({ owner, repo, state: 'open', per_page: 1 }),
          octokit.rest.pulls.list({ owner, repo, state: 'open', per_page: 1 }),
          octokit.rest.repos.listContributors({ owner, repo, per_page: 1 }),
        ]);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  stars: repoData.data.stargazers_count,
                  forks: repoData.data.forks_count,
                  openIssues: issues.data.length > 0 ? issues.data[0].number : 0, // Approximate
                  openPRs: pulls.data.length,
                  contributors: contributors.data.length > 0 ? contributors.data[0].contributions : 0,
                  language: repoData.data.language,
                  createdAt: repoData.data.created_at,
                  updatedAt: repoData.data.updated_at,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'github_list_contributors': {
        const owner = args.owner as string;
        const repo = args.repo as string;
        const period = (args.period as string) || 'month';

        const contributors = await octokit.rest.repos.listContributors({ owner, repo, per_page: 100 });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                contributors.data.map((contrib) => ({
                  username: contrib.login,
                  contributions: contrib.contributions,
                  avatar: contrib.avatar_url,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'github_get_issues': {
        const owner = args.owner as string;
        const repo = args.repo as string;
        const state = (args.state as string) || 'open';
        const labels = args.labels as string[] | undefined;

        const issues = await octokit.rest.issues.listForRepo({
          owner,
          repo,
          state: state as 'open' | 'closed' | 'all',
          labels: labels?.join(','),
          per_page: 100,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                issues.data
                  .filter((issue) => !issue.pull_request) // Exclude PRs
                  .map((issue) => ({
                    number: issue.number,
                    title: issue.title,
                    state: issue.state,
                    labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name)),
                    author: issue.user?.login,
                    createdAt: issue.created_at,
                    updatedAt: issue.updated_at,
                  })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'github_get_prs': {
        const owner = args.owner as string;
        const repo = args.repo as string;
        const state = (args.state as string) || 'open';

        const pulls = await octokit.rest.pulls.list({
          owner,
          repo,
          state: state as 'open' | 'closed' | 'all',
          per_page: 100,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                pulls.data.map((pr) => ({
                  number: pr.number,
                  title: pr.title,
                  state: pr.state,
                  author: pr.user?.login,
                  merged: pr.merged_at !== null,
                  createdAt: pr.created_at,
                  updatedAt: pr.updated_at,
                  mergedAt: pr.merged_at,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'github_get_commits': {
        const owner = args.owner as string;
        const repo = args.repo as string;
        const since = args.since as string | undefined;
        const author = args.author as string | undefined;
        const limit = Math.min((args.limit as number) || 30, 100);

        const commits = await octokit.rest.repos.listCommits({
          owner,
          repo,
          since,
          author,
          per_page: limit,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                commits.data.map((commit) => ({
                  sha: commit.sha,
                  message: commit.commit.message,
                  author: commit.commit.author?.name,
                  authorUsername: commit.author?.login,
                  date: commit.commit.author?.date,
                  url: commit.html_url,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'github_get_contributor': {
        const username = args.username as string;

        const [user, repos] = await Promise.all([
          octokit.rest.users.getByUsername({ username }),
          octokit.rest.repos.listForUser({ username, per_page: 100 }),
        ]);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  username: user.data.login,
                  name: user.data.name,
                  bio: user.data.bio,
                  publicRepos: user.data.public_repos,
                  followers: user.data.followers,
                  following: user.data.following,
                  createdAt: user.data.created_at,
                  repos: repos.data.map((repo) => ({
                    name: repo.name,
                    stars: repo.stargazers_count,
                    language: repo.language,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        },
      ],
      isError: true,
    };
  }
});

// List resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'github://repo/{owner}/{repo}/stats',
        name: 'GitHub Repository Stats',
        description: 'Statistics for a GitHub repository',
        mimeType: 'application/json',
      },
      {
        uri: 'github://repo/{owner}/{repo}/contributors',
        name: 'GitHub Repository Contributors',
        description: 'List of contributors for a GitHub repository',
        mimeType: 'application/json',
      },
      {
        uri: 'github://user/{username}/activity',
        name: 'GitHub User Activity',
        description: 'Activity information for a GitHub user',
        mimeType: 'application/json',
      },
    ],
  };
});

// Handle resource reads
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  if (uri.startsWith('github://repo/')) {
    const match = uri.match(/github:\/\/repo\/([^/]+)\/([^/]+)\/(.+)/);
    if (match) {
      const [, owner, repo, resource] = match;

      try {
        if (resource === 'stats') {
          const [repoData, issues, pulls] = await Promise.all([
            octokit.rest.repos.get({ owner, repo }),
            octokit.rest.issues.listForRepo({ owner, repo, state: 'open', per_page: 1 }),
            octokit.rest.pulls.list({ owner, repo, state: 'open', per_page: 1 }),
          ]);

          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(
                  {
                    stars: repoData.data.stargazers_count,
                    forks: repoData.data.forks_count,
                    openIssues: issues.data.length,
                    openPRs: pulls.data.length,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } else if (resource === 'contributors') {
          const contributors = await octokit.rest.repos.listContributors({ owner, repo, per_page: 100 });

          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(
                  contributors.data.map((c) => ({
                    username: c.login,
                    contributions: c.contributions,
                  })),
                  null,
                  2
                ),
              },
            ],
          };
        }
      } catch (error) {
        throw new Error(`Failed to fetch resource: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } else if (uri.startsWith('github://user/')) {
    const match = uri.match(/github:\/\/user\/([^/]+)\/activity/);
    if (match) {
      const [, username] = match;

      try {
        const user = await octokit.rest.users.getByUsername({ username });

        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  username: user.data.login,
                  publicRepos: user.data.public_repos,
                  followers: user.data.followers,
                  following: user.data.following,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        throw new Error(`Failed to fetch resource: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('GitHub MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in GitHub MCP server:', error);
  process.exit(1);
});
