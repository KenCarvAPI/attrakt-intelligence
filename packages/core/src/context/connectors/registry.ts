/**
 * Connector registry. Connectors register themselves here; the sync runner looks
 * them up by id. Keeps the framework open/closed — new connectors are added by
 * registration, not by editing the runner.
 */

import type { Connector } from './types';

const registry = new Map<string, Connector>();

export function registerConnector(connector: Connector): void {
  registry.set(connector.id, connector);
}

export function getConnector(id: string): Connector | undefined {
  return registry.get(id);
}

export function listConnectors(): Connector[] {
  return [...registry.values()];
}
