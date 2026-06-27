import {
  type CanonicalDocument,
  createConnectorRegistry,
  type SourceAuthority,
  type SourceConfig,
} from "@dkm/source-connectors";

/**
 * Run the document connectors over a folder and collect canonical documents.
 *
 * The filesystem connector handles Markdown/plaintext, the json connector handles `*.json` —
 * disjoint by extension, so running both over the same root covers a mixed docs folder with no
 * double-counting. New formats are picked up automatically: any connector the registry exposes
 * whose type is in {@link DOCUMENT_SOURCE_TYPES} is run (OCP — adding a connector + listing its
 * type here is the only change).
 */
export const DOCUMENT_SOURCE_TYPES = ["filesystem", "json"] as const;

export async function runConnectors(
  docsDir: string,
  authority: SourceAuthority,
): Promise<CanonicalDocument[]> {
  const registry = createConnectorRegistry();
  const available = new Set(registry.listConnectors().map((connector) => connector.type));

  const documents: CanonicalDocument[] = [];
  for (const type of DOCUMENT_SOURCE_TYPES) {
    if (!available.has(type)) continue;
    const connector = registry.getConnector(type);
    const config: SourceConfig = {
      id: `dkm-${type}`,
      type,
      connectionDetails: { rootPath: docsDir },
      filters: [],
      sourceAuthority: authority,
    };
    await connector.initialize(config);
    const result = await connector.ingest();
    documents.push(...result.documents);
  }
  return documents;
}
