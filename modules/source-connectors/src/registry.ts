import type { ConnectorMetadata, ConnectorRegistry, SourceConnector } from "./port";

/**
 * In-memory {@link ConnectorRegistry} using explicit registration (spec 004
 * Decision 4). New connector types are added solely through {@link register} —
 * the registry never needs to know their concrete types — which keeps it closed
 * for modification but open for extension (OCP).
 */
export class DefaultConnectorRegistry implements ConnectorRegistry {
  private readonly connectors = new Map<string, SourceConnector>();

  register(connector: SourceConnector): void {
    if (this.connectors.has(connector.type)) {
      throw new Error(`Connector type "${connector.type}" is already registered.`);
    }
    this.connectors.set(connector.type, connector);
  }

  getConnector(type: string): SourceConnector {
    const connector = this.connectors.get(type);
    if (!connector) {
      throw new Error(`No connector registered for unknown type "${type}".`);
    }
    return connector;
  }

  listConnectors(): ConnectorMetadata[] {
    return [...this.connectors.values()].map((connector) => ({
      type: connector.type,
      supportedFormats: [...connector.supportedFormats],
    }));
  }

  hasConnector(type: string): boolean {
    return this.connectors.has(type);
  }
}
