import { describe, it, expect } from 'vitest';
import { normalizeGitHubRelease, normalizeGitHubPull } from './github-product';
import { normalizeLinearIssue } from './linear';
import { normalizeCommunityMessage, type CommunityMessage } from './community';
import { ensureBuiltinConnectorsRegistered } from './builtin';
import { getConnector, listConnectors } from './registry';

describe('github-product normalizers', () => {
  it('normalizes a release into a PRODUCT/release item', () => {
    const item = normalizeGitHubRelease('attrakt/core', {
      id: 42,
      tag_name: 'v2.1.0',
      name: 'Context Engine',
      body: 'Adds retrieval.',
      html_url: 'https://github.com/attrakt/core/releases/42',
      published_at: '2026-06-01T00:00:00Z',
      author: { login: 'ben' },
    });
    expect(item.domain).toBe('PRODUCT');
    expect(item.kind).toBe('release');
    expect(item.externalId).toBe('gh:release:attrakt/core:42');
    expect(item.title).toContain('Context Engine');
    expect(item.text).toContain('Adds retrieval.');
    expect(item.occurredAt).toEqual(new Date('2026-06-01T00:00:00Z'));
    expect(item.structured).toMatchObject({ repo: 'attrakt/core', tag: 'v2.1.0', author: 'ben' });
  });

  it('falls back to tag when release has no name', () => {
    const item = normalizeGitHubRelease('a/b', {
      id: 1,
      tag_name: 'v1',
      name: null,
      body: null,
      html_url: 'u',
      published_at: null,
    });
    expect(item.title).toBe('a/b v1');
    expect(item.occurredAt).toBeUndefined();
  });

  it('normalizes a merged PR into a PRODUCT/issue item with labels', () => {
    const item = normalizeGitHubPull('attrakt/core', {
      number: 7,
      title: 'Add Linear connector',
      body: 'Pulls issues.',
      html_url: 'https://github.com/attrakt/core/pull/7',
      merged_at: '2026-06-10T12:00:00Z',
      user: { login: 'ben' },
      labels: [{ name: 'feature' }, 'context'],
    });
    expect(item.kind).toBe('issue');
    expect(item.externalId).toBe('gh:pr:attrakt/core:7');
    expect(item.structured).toMatchObject({ number: 7, type: 'pull_request', labels: ['feature', 'context'] });
  });
});

describe('linear normalizer', () => {
  it('normalizes an issue into a PRODUCT/issue item', () => {
    const item = normalizeLinearIssue({
      id: 'abc',
      identifier: 'ENG-12',
      title: 'Ship CE-1',
      description: 'Connectors.',
      url: 'https://linear.app/x/issue/ENG-12',
      updatedAt: '2026-06-15T09:00:00Z',
      state: { name: 'In Progress' },
      project: { name: 'Context Engine' },
      labels: { nodes: [{ name: 'backend' }] },
    });
    expect(item.domain).toBe('PRODUCT');
    expect(item.kind).toBe('issue');
    expect(item.externalId).toBe('linear:abc');
    expect(item.title).toBe('ENG-12 Ship CE-1');
    expect(item.structured).toMatchObject({ state: 'In Progress', project: 'Context Engine', labels: ['backend'] });
  });
});

describe('community normalizer', () => {
  const base: CommunityMessage = {
    id: 'm1',
    platform: 'DISCORD',
    channelId: 'c1',
    content: 'gm, loving the new release',
    sentiment: 0.8,
    metadata: {},
    createdAt: new Date('2026-06-20T00:00:00Z'),
  };

  it('normalizes a message into a COMMUNITY/community_signal item', () => {
    const item = normalizeCommunityMessage(base);
    expect(item.domain).toBe('COMMUNITY');
    expect(item.kind).toBe('community_signal');
    expect(item.externalId).toBe('msg:m1');
    expect(item.text).toBe('gm, loving the new release');
    expect(item.structured).toMatchObject({ platform: 'DISCORD', sentiment: 0.8, governance: false });
  });

  it('flags governance messages from metadata', () => {
    const item = normalizeCommunityMessage({ ...base, metadata: { governance: true } });
    expect(item.title).toContain('governance');
    expect(item.structured).toMatchObject({ governance: true });
  });
});

describe('builtin connector registration', () => {
  it('registers the three CE-1 connectors idempotently', () => {
    ensureBuiltinConnectorsRegistered();
    ensureBuiltinConnectorsRegistered(); // second call must not duplicate
    expect(getConnector('github_product')?.domain).toBe('PRODUCT');
    expect(getConnector('linear')?.domain).toBe('PRODUCT');
    expect(getConnector('community')?.domain).toBe('COMMUNITY');
    const ids = listConnectors().map((c) => c.id);
    expect(ids.filter((id) => id === 'community')).toHaveLength(1);
  });
});
