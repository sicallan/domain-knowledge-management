export * from "./port";
export type {
  CanonicalDocument,
  ContentType,
  DocumentSection,
  SourceAuthority,
} from "./canonical-document";
export {
  computeContentHash,
  computeDocumentId,
  inferContentType,
} from "./canonical-document";
export { parseMarkdownSections, firstHeadingTitle } from "./markdown-section-parser";
export { globToRegExp, matchGlob } from "./glob";
export { DefaultConnectorRegistry } from "./registry";
export { FilesystemConnector } from "./filesystem-connector";
export { registerConnectors, createConnectorRegistry } from "./register-connectors";
// The contract suite imports vitest, so it is exposed via its own module path
// (`@dkm/source-connectors/src/contract`) and intentionally not re-exported here.
