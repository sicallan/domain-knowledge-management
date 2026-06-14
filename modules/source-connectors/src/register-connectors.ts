import { FilesystemConnector } from "./filesystem-connector";
import { DefaultConnectorRegistry } from "./registry";
import type { ConnectorRegistry } from "./port";

/**
 * The single explicit registration point (spec 004 Decision 4). Adding a new
 * connector type — e.g. Feature 06's `json` — is a one-line addition here and
 * requires no change to the registry or to existing connectors (OCP).
 */
export function registerConnectors(registry: ConnectorRegistry): void {
  registry.register(new FilesystemConnector());
  // Future: registry.register(new JsonConnector());  // Feature 06
}

/** Convenience: a fresh registry with all built-in connectors registered. */
export function createConnectorRegistry(): ConnectorRegistry {
  const registry = new DefaultConnectorRegistry();
  registerConnectors(registry);
  return registry;
}
