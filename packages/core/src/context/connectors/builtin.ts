/**
 * Built-in connector registration.
 *
 * Idempotently registers the connectors shipped with the platform. The sync
 * runner calls `ensureBuiltinConnectorsRegistered()` so connectors are available
 * wherever a sync runs (worker, script, test) without relying on import order.
 */

import { registerConnector, getConnector } from './registry';
import { githubProductConnector } from './github-product';
import { linearConnector } from './linear';
import { communityConnector } from './community';

const BUILTINS = [githubProductConnector, linearConnector, communityConnector];

let registered = false;

export function ensureBuiltinConnectorsRegistered(): void {
  if (registered) return;
  for (const c of BUILTINS) {
    if (!getConnector(c.id)) registerConnector(c);
  }
  registered = true;
}
